"""Run the frozen paired semantic-supervision study on a single T4."""
import argparse
import gc
import hashlib
from importlib.metadata import version
import json
import math
from pathlib import Path
import random
import time

import adapter_scope_sft_v11 as engine
from semantic_supervision_data_v12 import ROOT, audit, read_labels, read_native
from semantic_supervision_v12 import (
    ARMS, batches, compare_at_endpoint, encode_train, exposure, load_tokenizer, read_plan, token_summary,
    verify_freeze,
)
from sparse_recipe_study_v4 import metrics_for


def response_losses(model, records, pad_id, device):
    """Causal next-token CE averaged over each recorded answer, including EOS."""
    import torch
    from torch.nn.functional import cross_entropy

    batch = engine.collate(records, pad_id, device)
    labels = batch.pop('labels')
    first_logit = min(row['prompt_tokens'] for row in records) - 1
    positions = torch.arange(first_logit, labels.shape[1] - 1, device=device)
    with torch.autocast(device, dtype=torch.float16, enabled=device == 'cuda'):
        logits = model(**batch, logits_to_keep=positions, use_cache=False).logits
    targets = labels[:, first_logit + 1:]
    active = targets != -100
    losses = cross_entropy(logits[active].float(), targets[active], reduction='none')
    per_answer = losses.split([row['target_tokens'] for row in records])
    return torch.stack([tokens.mean() for tokens in per_answer])


def microbatch(model, main, extra, indices, pad_id, device, *, backward):
    """Return decomposed loss and backpropagate each task without retaining both graphs."""
    paired = [index for index in indices if index in extra]
    primary = response_losses(model, [main[i] for i in indices], pad_id, device)
    weight = primary.new_tensor([0.5 if index in extra else 1.0 for index in indices])
    backward((primary * weight).mean())
    second_mean = None
    if paired:
        second = response_losses(model, [extra[i] for i in paired], pad_id, device)
        backward(second.sum() * (0.5 / len(indices)))
        second_mean = second.detach().mean().item()
    return {'primary_mean': primary.detach().mean().item(), 'second_mean': second_mean,
            'primary_weighted': (primary.detach() * weight).mean().item(),
            'second_weighted': 0.0 if second_mean is None else second_mean * 0.5 * len(paired) / len(indices)}


def tensor_hash(tensors):
    digest = hashlib.sha256()
    for name, value in tensors:
        digest.update(name.encode())
        digest.update(value.detach().cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()


def baseline_signature(folder):
    result = []
    for suffix in ('', 'diagnostic-', 'regression-'):
        rows = json.loads((folder / f'validation-step-{suffix}0.json').read_text())['records']
        result.extend((r['id'], r['text'], r['tokens']) for r in rows)
    return result


def train_arm(folder, snapshot, tokenizer, plan, data, primary, second, order, started, anchor=None):
    import numpy as np
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM

    folder.mkdir()
    runtime, training = plan['runtime'], plan['training']
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    seed = plan['seed']
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    base = AutoModelForCausalLM.from_pretrained(snapshot, dtype=torch.float16, attn_implementation='sdpa',
                                               trust_remote_code=False, local_files_only=True).to('cuda')
    probe = engine.collate(primary[:1], tokenizer.pad_token_id, 'cuda')
    probe.pop('labels')
    base.eval()
    with torch.inference_mode():
        before = base(**probe, logits_to_keep=1, use_cache=False).logits
    lora = training['lora']
    model = get_peft_model(base, LoraConfig(task_type='CAUSAL_LM', r=lora['rank'], lora_alpha=lora['alpha'],
                                          lora_dropout=lora['dropout'], target_modules=lora['targets'], bias='none'))
    model.eval()
    with torch.inference_mode():
        after = model(**probe, logits_to_keep=1, use_cache=False).logits
    if not torch.isfinite(after).all() or (after.float() - before.float()).abs().max().item() > 1e-5:
        raise ValueError('Initial adapter changed baseline logits')
    del probe, before, after
    trainable = [(name, p) for name, p in model.named_parameters() if p.requires_grad]
    frozen = [(name, p) for name, p in model.named_parameters() if not p.requires_grad]
    if (sum(p.numel() for _, p in trainable) != training['expected_trainable_parameters']
            or any('lora_' not in name or p.dtype != torch.float32 for name, p in trainable)):
        raise ValueError('Unexpected trainable parameters')
    initial = {'base': tensor_hash(frozen), 'adapter': tensor_hash(trainable)}
    engine.dump(folder / 'initial.json', initial)
    engine.dump(folder / 'scheduled-tokens.json', token_summary(primary, second, order))

    def check_budget():
        allocated = torch.cuda.max_memory_allocated()
        reserved = torch.cuda.max_memory_reserved()
        if allocated > runtime['peak_allocated_bytes'] or reserved > runtime['peak_reserved_bytes']:
            raise MemoryError(f'Frozen CUDA budget exceeded: allocated={allocated}, reserved={reserved}')
        if time.monotonic() - started > runtime['study_seconds']:
            raise TimeoutError('Study wall budget exceeded')
        return {'peak_allocated_bytes': allocated, 'peak_reserved_bytes': reserved}

    def evaluate(step):
        for suffix, group in (('', 'validation'), ('diagnostic-', 'diagnostic'), ('regression-', 'regression')):
            engine.evaluate(model, tokenizer, data[group], folder, f'{suffix}{step}', plan)
            check_budget()

    check_budget()
    evaluate(0)
    signature = baseline_signature(folder)
    if anchor is not None and (initial, signature) != anchor:
        raise ValueError('Fresh baseline or initialization differs between arms')
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant': False})
    model.enable_input_require_grads()
    params = [p for _, p in trainable]
    optimizer = torch.optim.AdamW(params, lr=training['learning_rate'], weight_decay=0.01)
    scaler = torch.amp.GradScaler('cuda', init_scale=256)
    width, accumulation = training['micro_batch'], training['accumulation']
    train_started = time.monotonic()

    with (folder / 'training.jsonl').open('x', buffering=1) as log:
        for step, indices in enumerate(batches(order, width * accumulation), 1):
            model.train()
            optimizer.zero_grad(set_to_none=True)
            factor = min(1.0, step / training['warmup_updates']) * (1 - (step - 1) / training['updates'])
            optimizer.param_groups[0]['lr'] = training['learning_rate'] * factor

            def backward(loss):
                if not torch.isfinite(loss):
                    raise ValueError('Nonfinite response loss')
                scaler.scale(loss / accumulation).backward()

            losses = []
            for micro in batches(indices, width):
                losses.append(microbatch(model, primary, second, micro, tokenizer.pad_token_id, 'cuda',
                                         backward=backward))
            scaler.unscale_(optimizer)
            grad_norm = torch.nn.utils.clip_grad_norm_(params, 1.0).item()
            if not math.isfinite(grad_norm) or grad_norm == 0 or any(p.grad is not None for _, p in frozen):
                raise ValueError('Invalid adapter or base gradient')
            scale = scaler.get_scale()
            scaler.step(optimizer)
            scaler.update()
            if scaler.get_scale() < scale:
                raise ValueError('FP16 optimizer step skipped')
            ids = [data['train'][i]['id'] for i in indices]
            log.write(json.dumps({'step': step, 'primary_ids': ids,
                                  'second_task_ids': [data['train'][i]['id'] for i in indices if i in second],
                                  'losses_by_microbatch': losses, 'grad_norm': grad_norm,
                                  'learning_rate': optimizer.param_groups[0]['lr'],
                                  'seconds': time.monotonic() - train_started}) + '\n')

            if step in training['evaluate_at']:
                ckpt = folder / f'checkpoint-{step}'
                model.save_pretrained(ckpt, safe_serialization=True)
                torch.save({'step': step, 'cursor': step * width * accumulation, 'optimizer': optimizer.state_dict(),
                            'scaler': scaler.state_dict(), 'torch_rng': torch.get_rng_state(),
                            'cuda_rng': torch.cuda.get_rng_state_all(), 'python_rng': random.getstate(),
                            'numpy_rng': np.random.get_state()}, ckpt / 'resume.pt')
                evaluate(step)
            check_budget()
            if time.monotonic() - train_started > runtime['training_seconds_per_arm_including_checkpoint_evaluations']:
                raise TimeoutError('Arm training budget exceeded')

    if tensor_hash(frozen) != initial['base'] or tensor_hash(trainable) == initial['adapter']:
        raise ValueError('Unexpected final base or adapter digest')
    engine.dump(folder / 'resources.json', {**check_budget(), 'seconds_since_study_start': time.monotonic() - started,
                                           'training_seconds_including_checkpoints': time.monotonic() - train_started})
    return initial, signature


def run(output):
    import torch
    from huggingface_hub import snapshot_download

    verify_freeze()
    plan = read_plan()
    runtime = plan['runtime']
    if (not torch.cuda.is_available() or runtime['gpu'] not in torch.cuda.get_device_name(0)
            or torch.__version__.split('+')[0] != runtime['torch'] or torch.version.cuda != runtime['cuda']):
        raise RuntimeError('The frozen study requires a physical T4 with PyTorch 2.6.0 / CUDA 12.4')
    for dependency in plan['dependencies']:
        package, expected = dependency.split('==')
        if version(package) != expected:
            raise RuntimeError(f'The study requires {dependency}')
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    engine.dump(output / 'environment.json', {'torch': torch.__version__, 'cuda': torch.version.cuda,
                                             'gpu': torch.cuda.get_device_name(0),
                                             'gpu_total_bytes': torch.cuda.get_device_properties(0).total_memory,
                                             'packages': plan['dependencies']})
    torch.set_num_threads(2)
    data, labels = read_native(), read_labels()
    audit(data, labels)
    settings = plan['model']
    snapshot = Path(snapshot_download(settings['repo'], revision=settings['revision'], token=False,
                    allow_patterns=['config.json', 'generation_config.json', 'tokenizer*.json', '*.jinja',
                                    'vocab.json', 'merges.txt', 'model.safetensors', 'LICENSE']))
    weights = snapshot / 'model.safetensors'
    if weights.stat().st_size != settings['weight_bytes'] or engine.digest(weights) != settings['weight_sha256']:
        raise ValueError('Base weight integrity failure')
    for name, expected in settings['small_file_sha256'].items():
        if engine.digest(snapshot / name) != expected:
            raise ValueError(f'Model metadata integrity failure: {name}')
    tokenizer = load_tokenizer(snapshot, plan)
    main, replay, auxiliary = encode_train(tokenizer, data['train'], labels, plan['max_sequence_tokens'])
    order = exposure(plan, len(main))
    benchmark = json.loads((ROOT / plan['evaluation']['master_file']).read_text())['splits']
    fresh_baseline = None
    results = {}
    for arm, second in zip(ARMS, (replay, auxiliary), strict=True):
        folder = output / arm
        print(f'Running {arm}', flush=True)
        fresh_baseline = train_arm(folder, snapshot, tokenizer, plan, data, main, second, order, started, fresh_baseline)
        results[arm] = [metrics_for(folder, step, benchmark) for step in (0, *plan['training']['evaluate_at'])]
        gc.collect()
        torch.cuda.empty_cache()
    outcome = compare_at_endpoint(results['primary_replay'][-1], results['semantic'][-1], plan)
    engine.dump(output / 'result.json', {'training_performed': True, 'matching_fresh_baselines': True,
                                        'arms': results, 'decision': outcome, 'scope': plan['scope']})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    run(parser.parse_args().output)

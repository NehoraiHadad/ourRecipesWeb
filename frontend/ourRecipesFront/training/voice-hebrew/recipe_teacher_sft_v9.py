"""Bounded Qwen3 LoRA pilot: same prompt/precision/decoder before and after."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import time

from sparse_recipe_v3 import aggregate
from sparse_recipe_data_v4 import messages

ROOT = Path(__file__).resolve().parent
PLAN = ROOT / 'verification/sparse-recipe-teacher-plan-v9-20261116.json'
ASSISTANT_END_ID = 151645


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def dump(path, value):
    path = Path(path)
    temp = path.with_suffix(path.suffix + '.partial')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def encode(tokenizer, row, limit):
    conversation = messages(row)
    prefix = tokenizer.apply_chat_template(conversation, tokenize=True, add_generation_prompt=True, enable_thinking=False)
    target = json.dumps(row['expected'], ensure_ascii=False, separators=(',', ':'))
    full = tokenizer.apply_chat_template(conversation + [{'role': 'assistant', 'content': target}],
                                         tokenize=True, add_generation_prompt=False, enable_thinking=False)
    if full[:len(prefix)] != prefix:
        raise ValueError('Training and generation prefixes differ')
    # No loss on the newline after EOS. EOS itself is supervised.
    last_eos = len(full) - 1 - full[::-1].index(ASSISTANT_END_ID)
    full = full[:last_eos + 1]
    if not len(prefix) < len(full) <= limit:
        raise ValueError(f'Empty or overlong example: {row["id"]}, {len(prefix)}/{len(full)}')
    return {'input_ids': full, 'labels': [-100] * len(prefix) + full[len(prefix):],
            'prompt_tokens': len(prefix), 'target_tokens': len(full) - len(prefix)}


def collate(encoded, pad_id, device):
    import torch
    length = max(len(row['input_ids']) for row in encoded)
    return {
        'input_ids': torch.tensor([row['input_ids'] + [pad_id] * (length - len(row['input_ids'])) for row in encoded], device=device),
        'attention_mask': torch.tensor([[1] * len(row['input_ids']) + [0] * (length - len(row['input_ids'])) for row in encoded], device=device),
        'labels': torch.tensor([row['labels'] + [-100] * (length - len(row['labels'])) for row in encoded], device=device),
    }


def evaluate(model, tokenizer, rows, output, step, plan):
    import torch
    model.eval(); model.config.use_cache = True
    outputs = []; records = []; started = time.monotonic()
    batch_size = plan['evaluation']['batch_size']
    for start in range(0, len(rows), batch_size):
        batch = rows[start:start + batch_size]
        texts = [tokenizer.apply_chat_template(messages(row), tokenize=False,
                 add_generation_prompt=True, enable_thinking=False) for row in batch]
        inputs = tokenizer(texts, padding=True, add_special_tokens=False, return_tensors='pt').to('cuda')
        if inputs['input_ids'].shape[1] + plan['evaluation']['max_new_tokens'] > plan['max_sequence_tokens']:
            raise ValueError('Evaluation would exceed context budget')
        began = time.monotonic()
        with torch.inference_mode():
            generated = model.generate(**inputs, do_sample=False,
                        max_new_tokens=plan['evaluation']['max_new_tokens'],
                        pad_token_id=tokenizer.pad_token_id, eos_token_id=plan['official_stop_ids'],
                        temperature=None, top_p=None, top_k=None)
        torch.cuda.synchronize()
        elapsed = time.monotonic() - began
        tail = generated[:, inputs['input_ids'].shape[1]:]
        decoded = tokenizer.batch_decode(tail, skip_special_tokens=True)
        for row, text, token_ids in zip(batch, decoded, tail.tolist()):
            outputs.append(text)
            records.append({'id': row['id'], 'family': row['family'], 'text': text,
                            'tokens': token_ids, 'batch_seconds': elapsed,
                            'latency_scope': 'shared batched GPU time, not phone/user turn'})
        dump(output / f'validation-step-{step}-partial.json', {'step': step, 'records': records})
    metrics, evaluations = aggregate(rows, outputs)
    for row, evaluation in zip(records, evaluations):
        row['evaluation'] = evaluation
    families = {}
    for family in sorted({r['family'] for r in rows}):
        indices = [i for i, r in enumerate(rows) if r['family'] == family]
        families[family] = aggregate([rows[i] for i in indices], [outputs[i] for i in indices])[0]
    report = {'step': step, 'metrics': metrics, 'by_family': families,
              'seconds': time.monotonic() - started, 'records': records}
    dump(output / f'validation-step-{step}.json', report)
    model.config.use_cache = False
    return report


def run(output):
    import numpy as np
    import torch
    import transformers
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig, get_peft_model
    import peft
    from huggingface_hub import snapshot_download

    plan = json.loads(PLAN.read_text())
    for name, expected in plan['source_sha256'].items():
        if digest(ROOT / name) != expected:
            raise ValueError('Source mismatch: ' + name)
    if digest(ROOT / plan['data_file']) != plan['data_sha256']:
        raise ValueError('Data mismatch')
    if not torch.cuda.is_available() or 'T4' not in torch.cuda.get_device_name(0):
        raise ValueError('Authorized physical T4 required')
    torch.set_num_threads(2)
    seed = plan['seed']; random.seed(seed); np.random.seed(seed); torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
    output = Path(output); output.mkdir(exist_ok=False)
    began = time.monotonic()

    def progress(phase, **fields):
        dump(output / 'progress.json', {'phase': phase, 'seconds': time.monotonic() - began, **fields})
        print(json.dumps({'phase': phase, **fields}), flush=True)

    progress('download')
    snapshot = Path(snapshot_download(plan['model']['repo'], revision=plan['model']['revision'],
                    allow_patterns=['*.json', '*.safetensors', '*.jinja', 'README.md', 'LICENSE'], token=False))
    weights = snapshot / 'model.safetensors'
    if weights.stat().st_size != plan['model']['weight_bytes'] or digest(weights) != plan['model']['weight_sha256']:
        raise ValueError('Weight integrity failure')
    for name, expected in plan['model']['small_file_sha256'].items():
        if digest(snapshot / name) != expected:
            raise ValueError('Model metadata mismatch: ' + name)
    tokenizer = AutoTokenizer.from_pretrained(snapshot, local_files_only=True, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    tokenizer.padding_side = 'left'
    assert tokenizer.pad_token_id == plan['pad_token_id']
    assert plan['assistant_end_token_id'] == ASSISTANT_END_ID
    data = json.loads((ROOT / plan['data_file']).read_text())['splits']
    encoded = [encode(tokenizer, row, plan['max_sequence_tokens']) for row in data['train']]
    val_encoded = [encode(tokenizer, row, plan['max_sequence_tokens']) for row in data['validation']]
    audit = {'train': len(encoded), 'validation': len(val_encoded), 'silent_truncation': False,
             'max_train_total_tokens': max(len(r['input_ids']) for r in encoded),
             'max_validation_prompt_tokens': max(r['prompt_tokens'] for r in val_encoded),
             'max_validation_target_tokens': max(r['target_tokens'] for r in val_encoded),
             'all_training_prefixes_equal_generation': True,
             'loss_scope': 'Assistant JSON plus EOS only; prompt and padding labels -100'}
    if audit['max_validation_prompt_tokens'] + plan['evaluation']['max_new_tokens'] > plan['max_sequence_tokens']:
        raise ValueError('Validation input+output exceeds budget')
    dump(output / 'token-audit.json', audit)
    progress('load_model')
    model = AutoModelForCausalLM.from_pretrained(snapshot, torch_dtype=torch.float16,
              attn_implementation='sdpa', trust_remote_code=False, local_files_only=True).to('cuda')
    model.config.use_cache = False
    assert list(model.generation_config.eos_token_id) == plan['official_stop_ids']
    model.eval()
    probe = collate(encoded[:1], tokenizer.pad_token_id, 'cuda')
    with torch.inference_mode():
        original_logits = model(input_ids=probe['input_ids'], attention_mask=probe['attention_mask'], logits_to_keep=1).logits.float().cpu()
    lora = plan['training']['lora']
    model = get_peft_model(model, LoraConfig(task_type='CAUSAL_LM', r=lora['rank'], lora_alpha=lora['alpha'],
                          lora_dropout=lora['dropout'], target_modules=lora['targets'], bias='none'))
    model.eval()
    with torch.inference_mode():
        initial_logits = model(input_ids=probe['input_ids'], attention_mask=probe['attention_mask'], logits_to_keep=1).logits.float().cpu()
    delta = (initial_logits - original_logits).abs().max().item()
    if delta > 1e-5:
        raise ValueError('Zero-initialized adapter changes baseline')
    del original_logits, initial_logits, probe
    trainable = [(name, p) for name, p in model.named_parameters() if p.requires_grad]
    if not trainable or any('lora_' not in name for name, p in trainable):
        raise ValueError('Unexpected trainable base parameter')
    frozen = [(name, p) for name, p in model.named_parameters() if not p.requires_grad]
    # Full digest of frozen tensors before/after, not a sample or assumed identity.
    def base_hash():
        h = hashlib.sha256()
        for name, param in frozen:
            h.update(name.encode()); h.update(param.detach().cpu().contiguous().numpy().tobytes())
        return h.hexdigest()
    initial_base_hash = base_hash()
    dump(output / 'environment.json', {'torch': torch.__version__, 'transformers': transformers.__version__,
         'peft': peft.__version__, 'python': __import__('platform').python_version(),
         'gpu': torch.cuda.get_device_name(0), 'gpu_total_bytes': torch.cuda.get_device_properties(0).total_memory,
         'trainable_parameters': sum(p.numel() for n, p in trainable),
         'total_parameters': sum(p.numel() for p in model.parameters()),
         'initial_adapter_max_logit_delta': delta, 'frozen_base_sha256': initial_base_hash})
    progress('baseline_validation')
    baseline = evaluate(model, tokenizer, data['validation'], output, 0, plan)
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant': False})
    model.enable_input_require_grads()
    params = [p for n, p in trainable]
    optimizer = torch.optim.AdamW(params, lr=plan['training']['learning_rate'], weight_decay=0.01)
    scaler = torch.amp.GradScaler('cuda', init_scale=256)
    curve = []; checkpoints = []; validations = [baseline]
    order = json.loads((ROOT / plan['training']['schedule_file']).read_text())['indices']; cursor = 0
    assert digest(ROOT / plan['training']['schedule_file']) == plan['training']['schedule_sha256']
    assert len(order) == plan['training']['updates'] * plan['training']['micro_batch'] * plan['training']['accumulation']
    train_began = time.monotonic()
    torch.cuda.reset_peak_memory_stats()
    for step in range(1, plan['training']['updates'] + 1):
        if time.monotonic() - train_began > plan['training']['max_seconds']:
            raise TimeoutError('Frozen training budget reached')
        model.train(); model.config.use_cache = False; optimizer.zero_grad(set_to_none=True)
        lr_factor = min(1.0, step / plan['training']['warmup_updates']) * (1 - (step - 1) / plan['training']['updates'])
        for group in optimizer.param_groups:
            group['lr'] = plan['training']['learning_rate'] * lr_factor
        losses = []; example_ids = []
        for micro in range(plan['training']['accumulation']):
            chosen = []
            for _ in range(plan['training']['micro_batch']):
                if cursor >= len(order):
                    raise ValueError('Frozen replay schedule exhausted')
                index = order[cursor]; cursor += 1; chosen.append(encoded[index]); example_ids.append(data['train'][index]['id'])
            batch = collate(chosen, tokenizer.pad_token_id, 'cuda')
            with torch.autocast('cuda', dtype=torch.float16):
                loss = model(**batch).loss
            if not torch.isfinite(loss):
                raise ValueError('Nonfinite loss')
            losses.append(loss.detach().item())
            scaler.scale(loss / plan['training']['accumulation']).backward()
        scaler.unscale_(optimizer)
        grad_norm = torch.nn.utils.clip_grad_norm_(params, 1.0).item()
        if not math.isfinite(grad_norm) or grad_norm == 0 or any(p.grad is not None for n, p in frozen):
            raise ValueError('Invalid adapter gradient or base gradient')
        old_scale = scaler.get_scale(); scaler.step(optimizer); scaler.update()
        if scaler.get_scale() < old_scale:
            raise ValueError('FP16 optimizer step skipped')
        row = {'step': step, 'loss': sum(losses) / len(losses), 'grad_norm': grad_norm,
               'learning_rate': optimizer.param_groups[0]['lr'], 'example_ids': example_ids,
               'seconds': time.monotonic() - train_began}
        curve.append(row)
        with (output / 'training.jsonl').open('a') as stream:
            stream.write(json.dumps(row) + '\n')
        if step == 2:
            changed = sum(torch.count_nonzero(p).item() for name, p in trainable if 'lora_B' in name)
            if not changed:
                raise ValueError('Adapter did not update')
            dump(output / 'smoke.json', {'real_optimizer_updates': 2, 'nonzero_lora_B_elements': changed,
                 'losses': [r['loss'] for r in curve], 'finite_nonzero_gradients': True,
                 'zero_initial_adapter_delta': delta, 'base_gradients_absent': True,
                 'scope': 'First two updates of this pilot, not a separate quality experiment'})
        if step % 10 == 0 or step == 2:
            progress('training', step=step, loss=row['loss'], seconds=row['seconds'])
        if step in plan['training']['evaluate_at']:
            path = output / f'checkpoint-{step}'; path.mkdir(exist_ok=False)
            model.save_pretrained(path, safe_serialization=True)
            torch.save({'optimizer': optimizer.state_dict(), 'scaler': scaler.state_dict(),
                        'step': step, 'order': order, 'cursor': cursor,
                        'torch_rng': torch.get_rng_state(), 'cuda_rng': torch.cuda.get_rng_state_all(),
                        'python_rng': random.getstate(), 'numpy_rng': np.random.get_state()}, path / 'resume.pt')
            checkpoints.append({'step': step, 'path': path.name, 'optimizer_retained': True})
            progress('validation', step=step)
            validations.append(evaluate(model, tokenizer, data['validation'], output, step, plan))
    if base_hash() != initial_base_hash:
        raise ValueError('Frozen base changed')
    best = validations[-1]  # Fixed160 endpoint, not checkpoint selection.
    b, m = baseline['metrics'], best['metrics']

    result = {'study': plan['study'], 'completed': True, 'training_performed': True,
              'updates': len(curve), 'baseline': b, 'endpoint_validation': m, 'endpoint_step': best['step'],
              'teacher_qualification_in_study_driver': True, 'product_quality_gate_passed': False,
              'checkpoints': checkpoints, 'full_frozen_base_hash_unchanged': True,
              'peak_cuda_allocated_bytes': torch.cuda.max_memory_allocated(),
              'peak_cuda_reserved_bytes': torch.cuda.max_memory_reserved(),
              'seconds': time.monotonic() - began,
              'scope': 'One seed, Hebrew1.7B contract adaptation with exact cached0.6B example order. Authored synthetic TRAIN/validation only. Same FP16 base, prompt and greedy decoder; no grammar repair. Not a comparison with previous Q4 results. No held tests, browser, quantization or physical phone.'}
    dump(output / 'result.json', result); progress('complete', result=result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('output'); args = parser.parse_args(); run(args.output)

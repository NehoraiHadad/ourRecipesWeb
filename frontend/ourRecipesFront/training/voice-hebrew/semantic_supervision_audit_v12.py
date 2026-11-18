"""Recompute V12 scores and verify both arms' retained checkpoints after VM release."""
import argparse
import io
import json
import math
from pathlib import Path
import struct
import zipfile

from semantic_supervision_colab_v12 import validate_archive
from semantic_supervision_data_v12 import read_native, read_labels
from semantic_supervision_job_v12 import write_json
from semantic_supervision_v12 import ARMS, ROOT, compare_at_endpoint, exposure, read_plan, verify_freeze
from sparse_recipe_v3 import aggregate

GROUPS = {'validation': '', 'diagnostic': 'diagnostic-', 'regression': 'regression-'}


def read_json(path):
    return json.loads(path.read_text())


def scores(folder, step, splits, benchmark):
    predictions = {}
    metrics = {}
    signatures = []
    for group, prefix in GROUPS.items():
        report = read_json(folder / f'validation-step-{prefix}{step}.json')
        rows = splits[group]
        raw = report['records']
        if [row['id'] for row in raw] != [row['id'] for row in rows]:
            raise ValueError(f'Unexpected record order in {group} at {step}')
        texts = [row['text'] for row in raw]
        result, details = aggregate(rows, texts)
        if result != report['metrics'] or details != [row['evaluation'] for row in raw]:
            raise ValueError(f'Recorded metrics differ from raw evaluation in {group} at {step}')
        metrics[group] = result
        signatures.extend((row['id'], row['text'], row['tokens']) for row in raw)
        if group != 'regression':
            predictions.update(zip((row['id'] for row in raw), texts, strict=True))
    development = benchmark['development']
    if set(predictions) != {row['id'] for row in development}:
        raise ValueError('Development records differ from frozen benchmark')
    if splits['regression'] != benchmark['regression']:
        raise ValueError('Regression records differ from frozen benchmark')
    by_cell = {}
    for cell in sorted({row['cell'] for row in development}):
        subset = [row for row in development if row['cell'] == cell]
        by_cell[cell] = aggregate(subset, [predictions[row['id']] for row in subset])[0]
    return {'step': step, 'all_development': aggregate(development, [predictions[row['id']] for row in development])[0],
            'by_cell': by_cell, 'regression': metrics['regression'], 'primary': metrics['validation']}, signatures


def training_curve(folder, splits, labels, plan):
    training = plan['training']
    train = splits['train']
    eligible = {label['id'] for label in labels}
    expected = [train[i]['id'] for i in exposure(plan, len(train))]
    micro, accumulation = training['micro_batch'], training['accumulation']
    width = micro * accumulation
    updates = [json.loads(line) for line in (folder / 'training.jsonl').read_text().splitlines()]
    if len(updates) != training['updates']:
        raise ValueError('Incorrect update count')
    for step, entry in enumerate(updates, 1):
        ids = expected[(step - 1) * width:step * width]
        paired = [record for record in ids if record in eligible]
        factor = min(1.0, step / training['warmup_updates']) * (1 - (step - 1) / training['updates'])
        lr = training['learning_rate'] * factor
        if (entry['step'] != step or entry['primary_ids'] != ids or entry['second_task_ids'] != paired
                or entry['learning_rate'] != lr or not math.isfinite(entry['grad_norm']) or entry['grad_norm'] <= 0):
            raise ValueError(f'Invalid exposure, learning rate, or gradient at update {step}')
        microbatches = entry['losses_by_microbatch']
        if len(microbatches) != accumulation:
            raise ValueError(f'Incorrect microbatch count at {step}')
        for i, loss in enumerate(microbatches):
            rows = ids[i * micro:(i + 1) * micro]
            count = sum(row in eligible for row in rows)
            second = loss['second_mean']
            values = [loss['primary_mean'], loss['primary_weighted'], loss['second_weighted']]
            if (bool(count) != (second is not None) or any(not math.isfinite(n) or n < 0 for n in values)
                    or (second is not None and (not math.isfinite(second) or second < 0))
                    or not math.isclose(loss['second_weighted'], (second or 0.0) * 0.5 * count / micro)):
                raise ValueError(f'Invalid response loss at {step}.{i}')
    return {'updates': len(updates), 'primary_visits': len(expected),
            'second_task_visits': sum(record in eligible for record in expected),
            'scheduled_exposure_and_learning_rate_verified': True}


def checkpoint(source, internal, arm, step, plan):
    prefix = f'study/{arm}/checkpoint-{step}/'
    config = json.loads(source.read(prefix + 'adapter_config.json'))
    lora = plan['training']['lora']
    if (set(config['target_modules']) != set(lora['targets']) or config['r'] != lora['rank']
            or config['lora_alpha'] != lora['alpha'] or config['lora_dropout'] != lora['dropout']
            or config['bias'] != 'none'):
        raise ValueError('Checkpoint configuration differs from frozen LoRA')
    weights, resume = prefix + 'adapter_model.safetensors', prefix + 'resume.pt'
    with source.open(weights) as stream:
        header_size = struct.unpack('<Q', stream.read(8))[0]
        if not 0 < header_size < 1024**2:
            raise ValueError('Invalid safetensors header size')
        header = json.loads(stream.read(header_size))
    tensors = {name: tensor for name, tensor in header.items() if name != '__metadata__'}
    params = sum(math.prod(tensor['shape']) for tensor in tensors.values())
    if (params != plan['training']['expected_trainable_parameters']
            or not all(t['dtype'] == 'F32' and ('.lora_A.' in n or '.lora_B.' in n) for n, t in tensors.items())):
        raise ValueError('Unexpected adapter weights')
    with zipfile.ZipFile(io.BytesIO(source.read(resume))) as state:
        if state.testzip() or not any(name.endswith('/data.pkl') for name in state.namelist()):
            raise ValueError('Invalid optimizer and RNG archive')
    return {'adapter': internal[weights], 'optimizer_rng': internal[resume], 'adapter_tensors': len(tensors),
            'adapter_parameters': params, 'optimizer_rng_crc_verified': True}


def audit(folder):
    verify_freeze()
    recovery = read_json(folder / 'recovery.json')
    owner = read_json(folder / 'owner-state.json')
    if owner['phase'] != 'stopped':
        raise ValueError('Verify release of the assigned T4 before publishing')
    recovered = folder / 'recovered'
    archive = folder / 'results.zip'
    member_count = validate_archive(archive, recovery, recovered)
    remote_status = read_json(recovered / 'status.json')
    if remote_status['status'] != recovery['status']:
        raise ValueError('Remote status differs from ownership log')

    plan = read_plan()
    splits = read_native()
    labels = read_labels()
    benchmark = read_json(ROOT / plan['evaluation']['master_file'])['splits']
    preflight = read_json(ROOT / 'verification/semantic-supervision-preflight-v12-20261118.json')
    evidence = {'study': plan['study'], 'completed': remote_status['status'] == 'complete',
                'session': owner['session'], 'hardware': read_json(recovered / 'hardware.json')
                if (recovered / 'hardware.json').exists() else None,
                'archive': {'sha256': recovery['sha256'], 'bytes': recovery['bytes'], 'members': member_count,
                            'outer_sha_crc_and_inner_sha_verified': True},
                'vm_stopped': True, 'arms': {}}
    steps = (0, *plan['training']['evaluate_at'])
    baseline = {}
    with zipfile.ZipFile(archive) as source:
        internal = json.loads(source.read('MANIFEST.json'))
        for arm in ARMS:
            path = recovered / 'study' / arm
            summaries = []
            for step in steps:
                files = [path / f'validation-step-{prefix}{step}.json' for prefix in GROUPS.values()]
                if all(file.is_file() for file in files):
                    result, raw = scores(path, step, splits, benchmark)
                    summaries.append(result)
                    if step == 0:
                        baseline[arm] = (read_json(path / 'initial.json'), raw)
            checkpoints = {}
            for step in steps[1:]:
                folder_prefix = f'study/{arm}/checkpoint-{step}/'
                if all(folder_prefix + name in internal for name in
                       ('adapter_model.safetensors', 'adapter_config.json', 'resume.pt')):
                    checkpoints[str(step)] = checkpoint(source, internal, arm, step, plan)
            run = {'summaries': summaries, 'checkpoints': checkpoints}
            if evidence['completed']:
                if len(summaries) != len(steps) or set(checkpoints) != set(map(str, steps[1:])):
                    raise ValueError(f'Incomplete run claimed complete: {arm}')
                run['training'] = training_curve(path, splits, labels, plan)
                tokens = read_json(path / 'scheduled-tokens.json')
                if tokens != preflight['scheduled_exposure'][arm]:
                    raise ValueError('Runtime token counts differ from frozen CPU audit')
                run['scheduled_tokens'] = tokens
                run['resources'] = read_json(path / 'resources.json')
            evidence['arms'][arm] = run

    if evidence['completed']:
        if baseline[ARMS[0]] != baseline[ARMS[1]] or len(baseline[ARMS[0]][1]) != 280:
            raise ValueError('Fresh comparisons differ between arms')
        summaries = {arm: evidence['arms'][arm]['summaries'] for arm in ARMS}
        outcome = compare_at_endpoint(summaries[ARMS[0]][-1], summaries[ARMS[1]][-1], plan)
        study_report = read_json(recovered / 'study/result.json')
        if summaries != study_report['arms'] or outcome != study_report['decision']:
            raise ValueError('Independent score recomputation differs from recorded outcome')
        evidence.update(matching_fresh_baseline_outputs_and_tokens=280, decision=outcome, raw_outputs_scored=1680)
    else:
        evidence['failure'] = remote_status
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run_folder', type=Path)
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    if args.report.exists():
        raise FileExistsError(args.report)
    write_json(args.report, audit(args.run_folder))

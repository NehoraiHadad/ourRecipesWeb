"""Same frozen SFT engine and hyperparameters, two TRAIN arms, common protocol."""
import argparse
import gc
import hashlib
import json
from pathlib import Path

import sparse_recipe_sft as engine
from sparse_recipe_data_v4 import messages
from sparse_recipe_v3 import aggregate

ROOT = Path(__file__).resolve().parent
PLAN = ROOT / 'verification/sparse-recipe-plan-v4-20261116.json'
FROZEN_EVALUATE = engine.evaluate


def metrics_for(folder, step, data):
    primary = json.loads((folder / f'validation-step-{step}.json').read_text())
    diagnostic = json.loads((folder / f'validation-step-diagnostic-{step}.json').read_text())
    regression = json.loads((folder / f'validation-step-regression-{step}.json').read_text())
    records = {r['id']: r for r in primary['records'] + diagnostic['records']}
    assert len(records) == len(data['development']) == 160
    assert set(records) == {r['id'] for r in data['development']}
    rows = data['development']; outputs = [records[r['id']]['text'] for r in rows]
    all_metrics = aggregate(rows, outputs)[0]
    by_cell = {}
    for cell in sorted({r['cell'] for r in rows}):
        subset = [r for r in rows if r['cell'] == cell]
        by_cell[cell] = aggregate(subset, [records[r['id']]['text'] for r in subset])[0]
    assert [r['id'] for r in regression['records']] == [r['id'] for r in data['regression']]
    assert aggregate(data['regression'], [r['text'] for r in regression['records']])[0] == regression['metrics']
    return {'step': step, 'all_development': all_metrics, 'by_cell': by_cell,
            'regression': regression['metrics'], 'primary': primary['metrics']}


def decision(control, diverse):
    c, d = control['primary'], diverse['primary']
    return {'primary_endpoint_step': 160,
            'hard_cell_exact_gain_cases': d['exact'] - c['exact'],
            'hard_cell_exact_gain_points': 100 * (d['exact'] - c['exact']) / 40,
            'data_intervention_gate_passed': (
                d['exact'] >= 32 and d['exact'] - c['exact'] >= 4
                and d['required_changes_correct'] / max(1, d['required_changes']) >= .8
                and diverse['all_development']['critical_wrong_fact_cases'] == 0
                and diverse['regression']['exact'] >= control['regression']['exact'] - 6
                and diverse['regression']['critical_wrong_fact_cases'] <= control['regression']['critical_wrong_fact_cases']),
            'product_promotion': False}


def run(output):
    import torch
    plan = json.loads(PLAN.read_text())
    for name, expected in {**plan['source_sha256'], **plan['artifact_sha256']}.items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
            raise ValueError('Frozen input mismatch: ' + name)
    data = json.loads((ROOT / plan['master_data_file']).read_text())['splits']
    output = Path(output); output.mkdir(exist_ok=False)
    engine.messages = messages
    summaries = {}
    for arm in ['control', 'diverse']:
        gc.collect(); torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats()
        engine.PLAN = ROOT / plan['arm_plans'][arm]
        arm_data = json.loads((ROOT / plan['arm_data'][arm]).read_text())['splits']
        memory = {}
        engine.dump(output / 'progress.json', {'phase': 'arm_running', 'arm': arm})

        def evaluate(model, tokenizer, rows, folder, step, settings):
            primary = FROZEN_EVALUATE(model, tokenizer, rows, folder, step, settings)
            FROZEN_EVALUATE(model, tokenizer, arm_data['diagnostic'], folder, f'diagnostic-{step}', settings)
            FROZEN_EVALUATE(model, tokenizer, arm_data['regression'], folder, f'regression-{step}', settings)
            memory[str(step)] = {'allocated_peak_bytes': torch.cuda.max_memory_allocated(),
                                 'reserved_peak_bytes': torch.cuda.max_memory_reserved(),
                                 'scope': 'Step0 retains load+all baseline peak before original engine resets stats; later steps after reset.'}
            engine.dump(folder / 'phase-memory.json', memory)
            engine.dump(output / 'progress.json', {'phase': 'evaluation_complete', 'arm': arm, 'step': step, 'primary': primary['metrics']})
            print(json.dumps({'arm': arm, 'evaluated_step': step, 'primary': primary['metrics']}), flush=True)
            return primary

        engine.evaluate = evaluate
        print(json.dumps({'phase': 'arm_start', 'arm': arm}), flush=True)
        engine.run(output / arm)
        summaries[arm] = [metrics_for(output / arm, step, data) for step in [0, 80, 160]]
        engine.dump(output / f'{arm}-summary.json', summaries[arm])
        gc.collect(); torch.cuda.empty_cache()
    baseline_same = True
    for group in ['', 'diagnostic-', 'regression-']:
        a, b = [json.loads((output / arm / f'validation-step-{group}0.json').read_text())['records'] for arm in ['control', 'diverse']]
        baseline_same &= [(r['id'], r['text'], r['tokens']) for r in a] == [(r['id'], r['text'], r['tokens']) for r in b]
    outcome = decision(summaries['control'][-1], summaries['diverse'][-1])
    outcome['identical_initial_baseline_outputs'] = baseline_same
    if not baseline_same: outcome['data_intervention_gate_passed'] = False
    result = {'study': plan['study'], 'completed': True, 'training_performed': True,
              'arms': summaries, 'decision': outcome,
              'scope': 'Two fresh adapters from same base,160 updates each; common navigation clarification. No reuse of old adapter or old held tests.160 development cases in80 pairs and120 exposed regression, each inferred repeatedly. Actual T4 only, no physical phone/browser/quantization.'}
    engine.dump(output / 'result.json', result)
    engine.dump(output / 'progress.json', {'phase': 'complete', 'decision': outcome})
    print(json.dumps({'phase': 'complete', 'decision': outcome}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('output'); args = parser.parse_args(); run(args.output)

"""Two data methods using the frozen V4 wrapper; extra TRAIN-fit diagnosis only."""
import argparse
import hashlib
import json
from pathlib import Path

import sparse_recipe_study_v4 as shared
from sparse_recipe_language_probe_v5 import build as language_probe, messages as language_messages
from sparse_recipe_v3 import aggregate

ROOT = Path(__file__).resolve().parent
PLAN = ROOT / 'verification/sparse-recipe-plan-v5-20261116.json'
ORIGINAL_EVALUATE = shared.FROZEN_EVALUATE


def retention(metrics, reference):
    return (metrics['all_development']['exact'] >= reference['all_development']['exact'] - 8
            and metrics['primary']['exact'] >= reference['primary']['exact']
            and metrics['primary']['required_changes_correct'] >= reference['primary']['required_changes_correct']
            and metrics['all_development']['critical_wrong_fact_cases'] <= reference['all_development']['critical_wrong_fact_cases']
            and metrics['regression']['exact'] >= 81
            and metrics['regression']['critical_wrong_fact_cases'] <= 5)


def run(output):
    plan = json.loads(PLAN.read_text())
    reference = json.loads((ROOT / plan['reference_file']).read_text())
    data = json.loads((ROOT / plan['master_data_file']).read_text())['splits']
    shared.PLAN = PLAN

    def evaluate(model, tokenizer, rows, folder, step, settings):
        result = ORIGINAL_EVALUATE(model, tokenizer, rows, folder, step, settings)
        if step == 160:
            key = 'control_fit' if folder.name == 'control' else 'diverse_fit'
            ORIGINAL_EVALUATE(model, tokenizer, data[key], folder, 'train-fit-160', settings)
            if folder.name == 'diverse' and result['metrics']['exact'] < 32:
                # One predeclared language-route diagnostic, never mixed into quality scores.
                original_messages = shared.engine.messages
                try:
                    for lang, probe_rows in language_probe().items():
                        shared.engine.messages = lambda row, current=lang: language_messages(row, current)
                        ORIGINAL_EVALUATE(model, tokenizer, probe_rows, folder, f'language-{lang}-160', settings)
                finally:
                    shared.engine.messages = original_messages
        return result

    shared.FROZEN_EVALUATE = evaluate
    shared.run(output)
    output = Path(output)
    result = json.loads((output / 'result.json').read_text())
    diagnoses = {}
    for arm, method in [('control', 'replay'), ('diverse', 'paired')]:
        same = True
        for prefix in ['', 'diagnostic-', 'regression-']:
            rows = json.loads((output / arm / f'validation-step-{prefix}0.json').read_text())['records']
            same &= [(r['id'], r['text'], r['tokens']) for r in rows] == [(r['id'], r['text'], r['tokens']) for r in reference['baseline'][prefix or 'primary']]
        fit = json.loads((output / arm / 'validation-step-train-fit-160.json').read_text())
        diagnoses[method] = {'same_baseline_as_cached_v4': same,
                             'retention_utility_gate_passed': retention(result['arms'][arm][-1], reference['endpoint']) and same,
                             'train_fit': fit['metrics'], 'fit_scope': '36 actual TRAIN examples; not validation or an independent accuracy estimate.'}
        diagnoses[method]['language_probe'] = {}
        for lang in ['he', 'en']:
            path = output / arm / f'validation-step-language-{lang}-160.json'
            if path.exists(): diagnoses[method]['language_probe'][lang] = json.loads(path.read_text())['metrics']
    final = {'study': plan['study'], 'completed': True, 'method_names': {'control': 'replay', 'diverse': 'paired'},
             'matched_comparison': result, 'reference': reference['endpoint'], 'diagnoses': diagnoses,
             'scope': 'Fresh adapters; V4 cached scores are reused evidence, not a third new training run. Retention utility is distinct from unchanged full quality gate and product approval.'}
    shared.engine.dump(output / 'v5-result.json', final)
    print(json.dumps({'phase': 'v5_complete', 'diagnoses': diagnoses}), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('output'); a = p.parse_args(); run(a.output)

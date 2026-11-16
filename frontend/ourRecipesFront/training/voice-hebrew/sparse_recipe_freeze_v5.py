"""Freeze new derived plans; refuses to overwrite experimental evidence."""
import copy
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def sha(name): return hashlib.sha256((ROOT / name).read_bytes()).hexdigest()


def create(name, value):
    with (ROOT / name).open('x') as stream: stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def freeze():
    old = json.loads((ROOT / 'verification/sparse-recipe-control-plan-v4-20261116.json').read_text())
    v4 = json.loads((ROOT / 'verification/sparse-recipe-plan-v4-20261116.json').read_text())
    for name in ['sparse_recipe_sft.py', 'sparse_recipe_data_v4.py', 'sparse_recipe_study_v4.py']:
        assert sha(name) == v4['source_sha256'][name]
    names = ['sparse_recipe_v3.py', 'sparse_recipe_data_v3.py', 'sparse_recipe_sft.py',
             'sparse_recipe_data_v4.py', 'sparse_recipe_study_v4.py', 'sparse_recipe_data_v5.py',
             'sparse_recipe_language_probe_v5.py', 'sparse_recipe_study_v5.py', 'sparse_recipe_job_v5.py',
             'sparse_recipe_colab_v5.py', 'sparse_recipe_preflight_v5.py', 'sparse_recipe_freeze_v5.py',
             'tests/test_sparse_recipe_v5.py', 'SPARSE_RECIPE_V5_RESEARCH.he.md', 'SPARSE_RECIPE_V5_PLAN.he.md']
    sources = {n: sha(n) for n in names}
    data_name = 'verification/sparse-recipe-data-v5-20261116.json'
    data = json.loads((ROOT / data_name).read_text())['splits']; arm_data = {}; arm_plans = {}
    for arm, train, fit in [('control', 'control_train', 'control_fit'), ('diverse', 'diverse_train', 'diverse_fit')]:
        name = f'verification/sparse-recipe-{arm}-data-v5-20261116.json'; arm_data[arm] = name
        groups = {'train': data[train], 'validation': [r for r in data['development'] if r['cell'] == 'unseen-recipe/unseen-frame'],
                  'diagnostic': [r for r in data['development'] if r['cell'] != 'unseen-recipe/unseen-frame'],
                  'regression': data['regression'], 'train_fit': data[fit]}
        create(name, {'splits': groups})
        plan = copy.deepcopy(old)
        plan.update(study='sparse-recipe-v5-' + arm, created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    source_sha256=sources, data_file=name, data_sha256=sha(name))
        plan['scope'] = 'V5 replay methods; exposed V4 development/regression, TRAIN-fit and conditional language diagnosis. No old held tests.'
        for key in ['model', 'training', 'evaluation', 'dependencies', 'seed', 'max_sequence_tokens']:
            assert plan[key] == old[key]
        name = f'verification/sparse-recipe-{arm}-plan-v5-20261116.json'; arm_plans[arm] = name; create(name, plan)
    artifacts = [data_name, 'verification/sparse-recipe-data-v4-20261116.json', 'verification/sparse-recipe-data-v3-20261116.json',
                 'verification/sparse-recipe-reference-v5-20261116.json', 'verification/sparse-recipe-preflight-v5-20261116.json',
                 'verification/sparse-recipe-research-v5-20261116.json', *arm_data.values(), *arm_plans.values()]
    plan = {'study': 'sparse-recipe-v5-replay-and-counterfactual',
            'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'source_sha256': sources, 'artifact_sha256': {n: sha(n) for n in artifacts},
            'master_data_file': data_name, 'arm_plans': arm_plans, 'arm_data': arm_data,
            'reference_file': 'verification/sparse-recipe-reference-v5-20261116.json',
            'dependencies': old['dependencies'], 'max_study_seconds': 3600, 'max_owner_seconds': 4500,
            'primary_endpoint': 160, 'primary_cell': 'unseen-recipe/unseen-frame',
            'method_names': {'control': 'replay', 'diverse': 'paired'},
            'quality_gate_unchanged': v4['gate'],
            'retention_utility_gate': {'all_dev_exact_min': 125, 'primary_exact_min': 26,
                'primary_changes_min': 16, 'all_dev_critical_wrong_facts_max': 2,
                'regression_exact_min': 81, 'regression_critical_wrong_facts_max': 5, 'product_promotion': False},
            'diagnostics': {'train_fit_each': 36, 'language_if_paired_primary_below': 32,
                            'language_cases_each': 16, 'language_diagnosis_not_quality': True},
            'source_model': old['model'],
            'scope': 'Two fresh adapters at fixed compute, cached V4 comparison explicit, no held sets or physical phone. Binary artifacts retained in one archive without redundant extraction.'}
    create('verification/sparse-recipe-plan-v5-20261116.json', plan)
    print(json.dumps({'sources': len(sources), 'artifacts': len(artifacts),
                      'bundle_uncompressed_bytes': sum((ROOT / n).stat().st_size for n in [*names, *artifacts])}))


if __name__ == '__main__': freeze()

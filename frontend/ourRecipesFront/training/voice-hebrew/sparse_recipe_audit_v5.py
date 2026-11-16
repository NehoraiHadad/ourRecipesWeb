"""Recompute all matched comparison metrics from the recovered immutable archive."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

from sparse_recipe_v3 import aggregate
from sparse_recipe_study_v4 import decision
from sparse_recipe_report import incorrect_mutations

ROOT = Path(__file__).resolve().parent


def audit_matched(run):
    run = ROOT / run
    plan = json.loads((ROOT / 'verification/sparse-recipe-plan-v5-20261116.json').read_text())
    for name, expected in {**plan['source_sha256'], **plan['artifact_sha256']}.items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    data = json.loads((ROOT / plan['master_data_file']).read_text())['splits']
    archive = run / 'results.zip'; outer = json.loads((run / 'archive-manifest.json').read_text())
    with archive.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == outer['sha256']
    with zipfile.ZipFile(archive) as src:
        assert src.testzip() is None
        manifest = json.loads(src.read('MANIFEST.json'))
        assert set(src.namelist()) == set(manifest) | {'MANIFEST.json'}
        for name, expected in manifest.items():
            raw = src.read(name)
            assert len(raw) == expected['bytes'] and hashlib.sha256(raw).hexdigest() == expected['sha256'], name
        load = lambda name: json.loads(src.read(name))
        status = load('status.json')
        result = load('study/result.json') if 'study/result.json' in manifest else None
        arms = {}; baseline_records = {}; example_orders = {}
        for arm in ['control', 'diverse']:
            prefix = f'study/{arm}/'
            if prefix + 'environment.json' not in manifest:
                continue
            arm_report = {'environment': load(prefix + 'environment.json'), 'steps': []}
            train = data['control_train' if arm == 'control' else 'diverse_train']
            indices = {r['id']: i for i, r in enumerate(train)}
            training = [json.loads(line) for line in src.read(prefix + 'training.jsonl').decode().splitlines()] if prefix + 'training.jsonl' in manifest else []
            example_orders[arm] = [[indices[i] for i in row['example_ids']] for row in training]
            arm_report['updates'] = len(training)
            arm_report['curve'] = {'first_loss': training[0]['loss'] if training else None,
                                  'last_loss': training[-1]['loss'] if training else None,
                                  'effective_examples': sum(len(r['example_ids']) for r in training)}
            for step in [0, 80, 160]:
                primary_name = prefix + f'validation-step-{step}.json'
                other_name = prefix + f'validation-step-diagnostic-{step}.json'
                regression_name = prefix + f'validation-step-regression-{step}.json'
                if not all(name in manifest for name in [primary_name, other_name, regression_name]):
                    continue
                primary, diagnostic, regression = map(load, [primary_name, other_name, regression_name])
                combined = primary['records'] + diagnostic['records']
                records = {r['id']: r for r in combined}
                assert len(combined) == len(records) == len(data['development'])
                assert set(records) == {r['id'] for r in data['development']}
                expected_primary = [r for r in data['development'] if r['cell'] == plan['primary_cell']]
                expected_diagnostic = [r for r in data['development'] if r['cell'] != plan['primary_cell']]
                for rows, raw in [(expected_primary, primary), (expected_diagnostic, diagnostic), (data['regression'], regression)]:
                    assert [r['id'] for r in rows] == [r['id'] for r in raw['records']]
                    summary, evaluations = aggregate(rows, [r['text'] for r in raw['records']])
                    assert summary == raw['metrics']
                    assert evaluations == [r['evaluation'] for r in raw['records']]
                rows = data['development']; outputs = [records[r['id']]['text'] for r in rows]
                combined_metrics, evaluations = aggregate(rows, outputs)
                groups = {}
                for key in ['cell', 'family']:
                    groups[key] = {}
                    for value in sorted({r[key] for r in rows}):
                        subset = [r for r in rows if r[key] == value]
                        groups[key][value] = aggregate(subset, [records[r['id']]['text'] for r in subset])[0]
                errors = [{'id': row['id'], 'cell': row['cell'], 'family': row['family'],
                           'utterance': row['input']['utterance'], 'expected': row['expected'],
                           'text': records[row['id']]['text'], 'evaluation': ev,
                           'incorrect_actual_mutations': incorrect_mutations(row, records[row['id']]['text'])}
                          for row, ev in zip(rows, evaluations) if not ev['exact']]
                arm_report['steps'].append({'step': step, 'all_development': combined_metrics,
                           'by_cell': groups['cell'], 'by_family': groups['family'],
                           'primary': primary['metrics'], 'regression': regression['metrics'],
                           'regression_by_family': regression['by_family'], 'errors': errors,
                           'posthoc_incorrect_mutation_cases': sum(bool(e['incorrect_actual_mutations']) for e in errors)})
                if step == 0:
                    baseline_records[arm] = [(r['id'], r['text'], r['tokens']) for r in combined + regression['records']]
            if prefix + 'phase-memory.json' in manifest:
                memory = load(prefix + 'phase-memory.json')
                arm_report['memory_observations'] = memory
                arm_report['observed_whole_arm_allocated_peak_bytes'] = max(v['allocated_peak_bytes'] for v in memory.values())
                arm_report['observed_whole_arm_reserved_peak_bytes'] = max(v['reserved_peak_bytes'] for v in memory.values())
            if prefix + 'result.json' in manifest:
                arm_report['engine_result'] = load(prefix + 'result.json')
            arms[arm] = arm_report
        verdict = None
        if result:
            assert status['status'] == 'complete'
            assert set(arms) == {'control', 'diverse'}
            assert all(a['updates'] == 160 and a['curve']['effective_examples'] == 640 and len(a['steps']) == 3 for a in arms.values())
            assert example_orders['control'] == example_orders['diverse']
            assert arms['control']['environment']['frozen_base_sha256'] == arms['diverse']['environment']['frozen_base_sha256']
            assert all(a['engine_result']['full_frozen_base_hash_unchanged'] for a in arms.values())
            for arm, summaries in result['arms'].items():
                for declared, computed in zip(summaries, arms[arm]['steps']):
                    for key in ['step', 'all_development', 'by_cell', 'regression', 'primary']:
                        assert declared[key] == computed[key], (arm, key)
            verdict = decision(arms['control']['steps'][-1], arms['diverse']['steps'][-1])
            identical = baseline_records['control'] == baseline_records['diverse']
            verdict['identical_initial_baseline_outputs'] = identical
            if not identical: verdict['data_intervention_gate_passed'] = False
            assert verdict == result['decision']
        return {'study': plan['study'], 'status': status, 'decision': verdict, 'arms': arms,
                'archive': str(archive.relative_to(ROOT)), 'archive_sha256': outer['sha256'],
                'archive_bytes': archive.stat().st_size, 'crc_and_all_members_verified': True,
                'all_frozen_sources_and_artifacts_verified': True,
                'retained_checkpoints': {n: v for n, v in manifest.items() if '/checkpoint-' in n},
                'scope': 'Recomputed authored synthetic development and exposed regression only. No new inference, old held sets, browser, phone, audio or product promotion. Error lists and actual mutation counts are descriptive, not checkpoint selection.'}



def audit(run):
    from sparse_recipe_study_v5 import retention
    from sparse_recipe_language_probe_v5 import build as language_probe
    result = audit_matched(run)
    root = ROOT / run
    plan = json.loads((ROOT / 'verification/sparse-recipe-plan-v5-20261116.json').read_text())
    reference = json.loads((ROOT / plan['reference_file']).read_text())
    data = json.loads((ROOT / plan['master_data_file']).read_text())['splits']
    with zipfile.ZipFile(root / 'results.zip') as src:
        names = set(src.namelist())
        v5 = json.loads(src.read('study/v5-result.json')) if 'study/v5-result.json' in names else None
        diagnoses = {}
        for arm, method in [('control', 'replay'), ('diverse', 'paired')]:
            if arm not in result['arms'] or len(result['arms'][arm]['steps']) < 3:
                continue
            prefix = f'study/{arm}/'
            fit = json.loads(src.read(prefix + 'validation-step-train-fit-160.json'))
            expected = data['control_fit' if arm == 'control' else 'diverse_fit']
            assert [r['id'] for r in fit['records']] == [r['id'] for r in expected]
            assert aggregate(expected, [r['text'] for r in fit['records']])[0] == fit['metrics']
            same = True
            for group in ['', 'diagnostic-', 'regression-']:
                records = json.loads(src.read(prefix + f'validation-step-{group}0.json'))['records']
                same &= [(r['id'], r['text'], r['tokens']) for r in records] == [(r['id'], r['text'], r['tokens']) for r in reference['baseline'][group or 'primary']]
            language = {}
            for lang, rows in language_probe().items():
                name = prefix + f'validation-step-language-{lang}-160.json'
                if name in names:
                    raw = json.loads(src.read(name)); assert [r['id'] for r in raw['records']] == [r['id'] for r in rows]
                    assert aggregate(rows, [r['text'] for r in raw['records']])[0] == raw['metrics']
                    language[lang] = raw['metrics']
            if method == 'paired':
                assert bool(language) == (result['arms'][arm]['steps'][-1]['primary']['exact'] < 32)
            expected_diagnosis = {'same_baseline_as_cached_v4': same,
                'retention_utility_gate_passed': retention(result['arms'][arm]['steps'][-1], reference['endpoint']) and same,
                'train_fit': fit['metrics'], 'fit_scope': '36 actual TRAIN examples; not validation or an independent accuracy estimate.',
                'language_probe': language}
            if v5: assert expected_diagnosis == v5['diagnoses'][method]
            diagnoses[method] = expected_diagnosis
        if v5:
            assert v5['reference'] == reference['endpoint']
            assert v5['matched_comparison']['decision'] == result['decision']
        result['method_names'] = {'control': 'replay', 'diverse': 'paired'}
        result['reference_cached_v4'] = reference['endpoint']
        result['reference_archive_sha256'] = reference['source_archive_sha256']
        result['diagnoses'] = diagnoses
        result['v5_summary_present'] = bool(v5)
        result['new_inference_outputs'] = 1680 + 72 + sum(sum(m['cases'] for m in d['language_probe'].values()) for d in diagnoses.values()) if v5 else None
        result['scope'] = 'V5 replay methods. Reused/exposed V4 development and regression, TRAIN-fit and conditional authored language probe are separate. Cached V4 is reused evidence, not a third training run. No held test or phone.'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('run'); parser.add_argument('--output', required=True)
    args = parser.parse_args(); result = audit(args.run)
    with Path(args.output).open('x') as stream: stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': result['status'], 'decision': result['decision'], 'diagnoses': result['diagnoses']}, indent=2))

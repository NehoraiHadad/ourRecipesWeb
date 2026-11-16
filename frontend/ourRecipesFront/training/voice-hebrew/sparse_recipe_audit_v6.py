"""Independently recompute every V6 score from the verified result archive."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import zipfile
from sparse_recipe_v3 import aggregate

ROOT = Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def audit(run):
    run = Path(run); plan = json.loads((ROOT / 'verification/sparse-recipe-plan-v6-20261116.json').read_text())
    for name, expected in plan['source_sha256'].items(): assert sha(ROOT / name) == expected, name
    operator = json.loads((ROOT / 'verification/sparse-recipe-run-v6-20261116.json').read_text())
    assert sha(ROOT / operator['owner']) == operator['owner_sha256']
    assert sha(ROOT / 'verification/sparse-recipe-plan-v6-20261116.json') == operator['plan_sha256']
    for name, expected in plan['artifact_sha256'].items():
        if not name.startswith('adapter/'): assert sha(ROOT / name) == expected, name
    origin = ROOT / 'runs/ourrecipes-sparse-v5-20261116/results.zip'
    assert sha(origin) == plan['adapter_origin_archive_sha256']
    with zipfile.ZipFile(origin) as src:
        for name, expected in plan['artifact_sha256'].items():
            if name.startswith('adapter/'):
                raw = src.read('study/diverse/checkpoint-160/' + Path(name).name)
                assert hashlib.sha256(raw).hexdigest() == expected
    archive = run / 'results.zip'; outer = json.loads((run / 'archive-manifest.json').read_text())
    assert sha(archive) == outer['sha256'] and archive.stat().st_size == outer['bytes']
    data = json.loads((ROOT / plan['data_file']).read_text()); rows = data['hard'] + data['regression']
    token_budget = json.loads((ROOT / 'verification/sparse-recipe-token-budget-v6-20261116.json').read_text())
    with zipfile.ZipFile(archive) as src:
        assert src.testzip() is None
        manifest = json.loads(src.read('MANIFEST.json'))
        assert set(src.namelist()) == set(manifest) | {'MANIFEST.json'}
        for name, meta in manifest.items():
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            raw = src.read(name)
            assert len(raw) == meta['bytes'] and hashlib.sha256(raw).hexdigest() == meta['sha256'], name
        status = json.loads(src.read('status.json')); assert status['status'] == 'complete'
        saved = json.loads(src.read('study/result.json'))
        scores = {}; evaluations = {}; details = {}
        for route in plan['routes']:
            report = json.loads(src.read('study/' + route + '.json')); records = report['records']
            assert [r['id'] for r in records] == [r['id'] for r in rows]
            assert all(len(r['tokens']) <= plan['max_new_tokens'] and r['prompt_tokens'] + plan['max_new_tokens'] <= plan['max_sequence_tokens'] for r in records)
            token_reference = token_budget['models']['teacher' if route == 'teacher-json' else 'tiny']
            lengths = [r['prompt_tokens'] for r in records]
            assert (min(lengths), statistics.median(lengths), max(lengths), sum(lengths)) == (
                token_reference['prompt_min'], token_reference['prompt_median'], token_reference['prompt_max'], token_reference['sum_prompt_tokens'])
            outputs = [r['text'] for r in records]
            evaluations[route] = aggregate(rows, outputs)[1]
            scores[route] = {group: aggregate(subset, outputs[:40] if group == 'hard' else outputs[40:])[0] for group, subset in data.items()}
            assert scores[route] == report['metrics'] == saved['results'][route]['metrics']
            assert report['median_generation_seconds'] == statistics.median(r['seconds'] for r in records)
            details[route] = {k:v for k,v in report.items() if k not in ('records', 'metrics')}
            details[route]['hit_token_limit'] = sum(r['hit_token_limit'] for r in records)
        comparisons = {}
        for left, right in [('tiny-free', 'tiny-json'), ('tiny-json', 'teacher-json')]:
            comparisons[left + '->' + right] = {
                'wins': sum(not a['exact'] and b['exact'] for a,b in zip(evaluations[left], evaluations[right])),
                'losses': sum(a['exact'] and not b['exact'] for a,b in zip(evaluations[left], evaluations[right])),
                'both_wrong': sum(not a['exact'] and not b['exact'] for a,b in zip(evaluations[left], evaluations[right]))}
        t = scores['teacher-json']; gate = plan['reference_utility']
        useful = (t['hard']['exact'] >= gate['hard_exact_min']
            and t['hard']['required_changes_correct'] >= gate['hard_changes_min']
            and t['hard']['critical_wrong_fact_cases'] <= gate['hard_critical_wrong_max']
            and t['regression']['exact'] >= gate['regression_exact_min']
            and t['regression']['critical_wrong_fact_cases'] <= gate['regression_critical_wrong_max'])
        return {'study': plan['study'], 'status': status, 'hardware': json.loads(src.read('hardware.json')),
            'scores': scores, 'runtime': details, 'paired_comparisons': comparisons, 'operator_provenance': operator,
            'reference_utility_gate_passed': useful, 'product_promotion': False,
            'archive_sha256': outer['sha256'], 'archive_bytes': outer['bytes'],
            'crc_manifest_source_data_adapter_verified': True, 'cpu_and_gpu_prompt_token_counts_match': True, 'scope': plan['scope']}


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('run'); p.add_argument('--output', required=True)
    args = p.parse_args(); result = audit(args.run)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))

"""Audit recovered pilot evidence; no inference, training or checkpoint selection changes."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

from sparse_recipe_v3 import aggregate, parse

ROOT = Path(__file__).resolve().parent


def incorrect_mutations(row, text):
    """Count only proposed changes away from before, not omissions of required changes."""
    try:
        actual = parse(text, row['input'])
    except (ValueError, TypeError, KeyError):
        return []
    before = row['input']['progress']
    desired = {**before, **{f['action']: f['status'] for f in row['expected']['facts']}}
    return [f['action'] for f in actual['facts']
            if f['status'] != before[f['action']] and f['status'] != desired[f['action']]]


def audit(run):
    run = Path(run)
    plan = json.loads((ROOT / 'verification/sparse-recipe-plan-v3-20261116.json').read_text())
    raw_data = (ROOT / plan['data_file']).read_bytes()
    assert hashlib.sha256(raw_data).hexdigest() == plan['data_sha256']
    rows = json.loads(raw_data)['splits']['validation']
    archive = run / 'results.zip'
    outer = json.loads((run / 'archive-manifest.json').read_text())
    with archive.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == outer['sha256']
    with zipfile.ZipFile(archive) as src:
        assert src.testzip() is None
        manifest = json.loads(src.read('MANIFEST.json'))
        assert set(src.namelist()) == set(manifest) | {'MANIFEST.json'}
        for name, expected in manifest.items():
            data = src.read(name)
            assert len(data) == expected['bytes'] and hashlib.sha256(data).hexdigest() == expected['sha256'], name
        status = json.loads(src.read('status.json'))
        result = json.loads(src.read('study/result.json')) if 'study/result.json' in manifest else None
        summaries = []
        for step in [0, *plan['training']['evaluate_at']]:
            name = f'study/validation-step-{step}.json'
            if name not in manifest:
                continue
            validation = json.loads(src.read(name))
            records = validation['records']
            assert [r['id'] for r in records] == [r['id'] for r in rows]
            metrics, evaluations = aggregate(rows, [r['text'] for r in records])
            assert validation['metrics'] == metrics
            assert [r['evaluation'] for r in records] == evaluations
            changed_incorrectly = [row['id'] for row, record in zip(rows, records) if incorrect_mutations(row, record['text'])]
            summaries.append({'step': step, 'source_sha256': manifest[name]['sha256'], 'metrics': metrics,
                              'by_family': validation['by_family'],
                              'posthoc_incorrect_actual_mutation_cases': changed_incorrectly,
                              'posthoc_incorrect_actual_mutation_count': len(changed_incorrectly)})
        if result:
            assert status['status'] == 'complete' and len(summaries) == 3
            assert summaries[0]['metrics'] == result['baseline']
            selected = next(s for s in summaries if s['step'] == result['best_step'])
            assert selected['metrics'] == result['best_validation']
        checkpoints = {n: v for n, v in manifest.items() if '/checkpoint-' in n}
        report = {'study': plan['study'], 'archive': str(archive.relative_to(ROOT)), 'archive_sha256': outer['sha256'],
                  'archive_bytes': archive.stat().st_size, 'crc_and_all_members_verified': True,
                  'status': status, 'result': result, 'validation': summaries,
                  'checkpoints': checkpoints, 'all_retained_in_archive': True,
                  'environment': json.loads(src.read('study/environment.json')) if 'study/environment.json' in manifest else None,
                  'token_audit': json.loads(src.read('study/token-audit.json')) if 'study/token-audit.json' in manifest else None,
                  'smoke': json.loads(src.read('study/smoke.json')) if 'study/smoke.json' in manifest else None,
                  'metric_note': 'Frozen unsafe_state conflates an unexpected fact and any wrong final-state action, including missed updates. Do not interpret it as an actual incorrect-mutation count. The separate posthoc count checks each proposed fact differs from both prior and expected state. It is descriptive, not used to select checkpoints or change the preregistered gate.',
                  'limits': ['Authored synthetic TRAIN/validation, no human review or independent test.',
                             'Matched FP16 baseline and adaptation, not causal comparison with earlier Q4 contract.',
                             'GPU inference/training only, no quantization/browser/physical-phone test.',
                             'Recipe knowledge, conversation generation, ASR and TTS not evaluated in this pilot.']}
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('run'); p.add_argument('--output', required=True)
    args = p.parse_args(); value = audit(ROOT / args.run)
    with Path(args.output).open('x') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'complete': value['status'], 'result': value['result']}, ensure_ascii=False, indent=2))

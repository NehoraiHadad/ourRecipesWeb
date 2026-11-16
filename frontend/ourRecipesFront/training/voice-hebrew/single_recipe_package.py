"""Create a new, verified research handoff without overwriting previous artifacts."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
PREFIX = 'frontend/ourRecipesFront/training/voice-hebrew/'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    packet = ROOT / 'dist/ourRecipes-single-recipe-study-20261116.zip'
    metadata = ROOT / 'verification/single-recipe-packet-20261116.json'
    if packet.exists() or metadata.exists():
        raise FileExistsError('Preserve prior packet and metadata; choose a new version')
    files = {}
    names = [
        'README.he.md', 'PROJECT_WORK_PLAN.he.md', 'RESEARCH_LOG.he.md',
        'SINGLE_RECIPE_STUDY_PLAN.he.md', 'SINGLE_RECIPE_RESULTS.he.md',
        'SINGLE_RECIPE_REPRODUCTION.he.md', 'STAGE1_RESULTS.he.md',
        'PARITY_REPRODUCTION.he.md', 'recipe_contract_v1.mjs',
        'recipe_contract_v1.test.mjs', 'recipe_development_v1.mjs',
        'recipe_development_v1.test.mjs', 'tiny_recipe_cases.mjs',
        'tiny_recipe_cases.test.mjs', 'recipe_single_v2.mjs',
        'decision_protocol_v2.mjs', 'decision_protocol_v2.test.mjs',
        'recipe_compact_context_v2.mjs', 'single_recipe_study.py',
        'single_action_probe.py', 'single_recipe_report.mjs',
        'single_recipe_report.test.mjs', 'single_recipe_package.py',
    ]
    names += [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'verification').glob('single-*-20261116*.json'))
              if 'packet' not in p.name]
    for folder in ('verification/nativ-inspection-20261116',
                   'runs/single-recipe-v2', 'runs/single-action-probe-20261116'):
        names += [str(p.relative_to(ROOT)) for p in sorted((ROOT / folder).rglob('*')) if p.is_file()]
    for name in names:
        if name in files:
            raise ValueError(f'Duplicate entry: {name}')
        files[name] = (ROOT / name).read_bytes()
    plans = [
        ('verification/single-recipe-plan-20261116.json', 'f46838f'),
        ('verification/single-recipe-plan-20261116-compatible.json', 'a378c5a'),
        ('verification/single-recipe-plan-20261116-compact.json', 'a378c5a'),
        ('verification/single-action-probe-plan-20261116.json', '288a808'),
    ]
    for name, commit in plans:
        plan = json.loads(files[name])
        for source, expected in plan['source_sha256'].items():
            data = subprocess.check_output(['git', 'show', f'{commit}:{PREFIX}{source}'], cwd=ROOT)
            if sha(data) != expected:
                raise ValueError(f'Snapshot mismatch: {commit}:{source}')
            files[f'snapshots/{commit}/{source}'] = data
        if 'data_file' in plan and sha(files[plan['data_file']]) != plan['data_sha256']:
            raise ValueError(f'Data mismatch: {name}')
    files['README-PACKET.txt'] = (
        'Single-recipe CPU development study, 2026-11-16.\n'
        'Start with SINGLE_RECIPE_RESULTS.he.md and SINGLE_RECIPE_REPRODUCTION.he.md.\n'
        'Four completed arms: 80 synthetic scenarios each; 320 outputs are not independent scenarios.\n'
        'Separate diagnostic: 16 projected decisions per model, excluded from main scores.\n'
        'No model promoted. No training, held-test inference, audio, browser or physical-phone test here.\n'
        'No weights, runtime binaries, credentials or user recordings bundled. Public assets need separate download.\n'
        'snapshots/ preserves plan-matched sources; current files include later reporting/tests.\n'
        'Full historical docs are context; their older relative links may refer to the original repository.\n'
        'All manifest entries are SHA256 checked, and Node code/data tests run after extraction.\n'
    ).encode()
    manifest = {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in sorted(files.items())}
    files['MANIFEST.json'] = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode()
    packet.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(packet, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in sorted(files.items()):
            archive.writestr(name, data)
    with tempfile.TemporaryDirectory(prefix='recipe-packet-') as folder:
        with zipfile.ZipFile(packet) as archive:
            if archive.testzip() is not None:
                raise ValueError('CRC failure')
            for name, expected in manifest.items():
                data = archive.read(name)
                assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], name
            archive.extractall(folder)
        tests = ['recipe_contract_v1.test.mjs', 'recipe_development_v1.test.mjs',
                 'tiny_recipe_cases.test.mjs', 'decision_protocol_v2.test.mjs',
                 'single_recipe_report.test.mjs']
        completed = subprocess.run(['node', '--test', '--test-reporter=tap', *tests],
                                   cwd=folder, text=True, capture_output=True)
        stdout = ROOT / 'verification/single-recipe-packet-tests-20261116.txt'
        stdout.write_text(completed.stdout + completed.stderr)
        if completed.returncode or not re.search(r'^# pass 25$', completed.stdout, re.M) or not re.search(r'^# fail 0$', completed.stdout, re.M):
            raise RuntimeError(f'Extracted packet tests failed; inspect {stdout}')
    data = packet.read_bytes()
    result = {'file': str(packet), 'bytes': len(data), 'sha256': sha(data),
              'members': len(files), 'manifest_entries': len(manifest),
              'crc_verified': True, 'all_manifest_sha_verified': True,
              'extracted_code_tests_passed': 25,
              'tests_stdout_sha256': sha(stdout.read_bytes()),
              'frozen_snapshots_verified': plans,
              'scope': 'CPU cloud inference on authored synthetic data; no training or physical phone'}
    metadata.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()

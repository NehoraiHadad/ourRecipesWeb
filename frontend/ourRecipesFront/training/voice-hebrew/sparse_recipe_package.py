"""Package one pilot, including its original adapter/resume archive, never account logs."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def package(run, result, filename):
    run = ROOT / run; result = ROOT / result; packet = ROOT / 'dist' / filename
    metadata = ROOT / 'verification/sparse-recipe-packet-v3-20261116.json'
    if packet.exists() or metadata.exists():
        raise FileExistsError('Preserve existing artifact, use a new packet version')
    if (run / 'results.zip').stat().st_size + 12 * 1024**2 > shutil.disk_usage(ROOT).free:
        raise RuntimeError('Insufficient storage; original run archive remains intact')
    names = [
        'SPARSE_RECIPE_PILOT_PLAN.he.md', 'SPARSE_RECIPE_REPRODUCTION.he.md', 'SPARSE_RECIPE_RESULTS.he.md',
        'PROJECT_WORK_PLAN.he.md', 'README.he.md', 'RESEARCH_LOG.he.md',
        'sparse_recipe_v3.py', 'sparse_recipe_data_v3.py', 'sparse_recipe_sft.py',
        'sparse_recipe_job.py', 'sparse_recipe_colab.py', 'sparse_recipe_report.py', 'sparse_recipe_package.py', 'sparse_recipe_error_review.py',
        'tests/test_sparse_recipe_v3.py', 'tests/test_sparse_recipe_report.py',
        'verification/sparse-recipe-plan-v3-20261116.json', 'verification/sparse-recipe-data-v3-20261116.json',
        'verification/sparse-recipe-token-audit-v3-20261116.json', 'verification/sparse-recipe-data-audit-v3-20261116.json',
        'verification/sparse-recipe-errors-v3-20261116.json',
        str(result.relative_to(ROOT)),
    ]
    names += [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'verification/qwen-sparse-source-20261116').rglob('*')) if p.is_file()]
    names += [str((run / n).relative_to(ROOT)) for n in ['results.zip', 'archive-manifest.json', 'recovery.json', 'remote-status.json', 'remote.log', 'material.zip']]
    files = {name: (ROOT / name).read_bytes() for name in names}
    plan = json.loads(files['verification/sparse-recipe-plan-v3-20261116.json'])
    for name, expected in plan['source_sha256'].items():
        assert sha(files[name]) == expected, name
    files['README-PACKET.txt'] = (
        'Sparse recipe Qwen3 LoRA pilot, 2026-11-16.\n'
        'Start with SPARSE_RECIPE_RESULTS.he.md and SPARSE_RECIPE_REPRODUCTION.he.md.\n'
        'One T4 seed, 360 authored synthetic TRAIN and120 validation cases. No held-test or physical-phone claim.\n'
        'The nested runs/.../results.zip is the original SHA-verified result archive.\n'
        'It contains all raw validation responses, optimizer curve, adapter weights and resume states at80/160.\n'
        'Base weights and runtime dependencies need separate public downloads at the pinned versions.\n'
        'No account logs, credentials, SSH key, user recordings or old held tests included.\n'
        'Training sources match the frozen plan; reporting/packaging helpers were added later.\n'
        'Frozen unsafe_state is not an actual-mutation count; see the explicit metric note in the result audit.\n'
        'Standalone code/data tests are run after extracting only small sources; no GPU or model weights needed.\n'
        'Historical links in project docs may refer to the full repository.\n'
    ).encode()
    manifest = {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in sorted(files.items())}
    files['MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    with zipfile.ZipFile(packet, 'x', zipfile.ZIP_DEFLATED) as dest:
        for name, data in sorted(files.items()):
            dest.writestr(name, data, compress_type=zipfile.ZIP_STORED if name.endswith('.zip') else zipfile.ZIP_DEFLATED)
    with tempfile.TemporaryDirectory(prefix='sparse-packet-') as folder:
        with zipfile.ZipFile(packet) as src:
            assert src.testzip() is None
            for name, expected in manifest.items():
                data = src.read(name)
                assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], name
                if name.endswith(('.py', '.json', '.md', '.txt')):
                    path = Path(folder) / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
        test = subprocess.run(['python', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_sparse_recipe*.py', '-v'],
                              cwd=folder, text=True, capture_output=True)
        stdout = test.stdout + test.stderr
        (ROOT / 'verification/sparse-recipe-packet-tests-v3-20261116.txt').write_text(stdout)
        assert test.returncode == 0 and re.search(r'Ran 10 tests', stdout) and stdout.rstrip().endswith('OK')
    with packet.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    proof = {'file': str(packet), 'bytes': packet.stat().st_size, 'sha256': digest,
             'members': len(files), 'manifest_entries': len(manifest), 'crc_verified': True,
             'all_manifest_members_verified': True, 'extracted_small_source_tests_passed': 10,
             'nested_original_results_archive_preserved': True,
             'model_base_weights_bundled': False, 'adapter_and_optimizer_checkpoints_bundled': True,
             'private_account_files_bundled': False}
    metadata.write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('run'); parser.add_argument('result')
    parser.add_argument('--filename', default='ourRecipes-sparse-qwen-pilot-20261116.zip')
    args = parser.parse_args(); package(args.run, args.result, args.filename)

"""Portable evidence plus original four-checkpoint archive, excluding account state."""
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


def sha(data): return hashlib.sha256(data).hexdigest()


def package(run):
    run = ROOT / run
    packet = ROOT / 'dist/ourRecipes-sparse-data-comparison-20261116.zip'
    proof_path = ROOT / 'verification/sparse-recipe-packet-v4-20261116.json'
    if packet.exists() or proof_path.exists():
        raise FileExistsError('Preserve previous packets; choose a new version')
    if (run / 'results.zip').stat().st_size + 16 * 1024**2 > shutil.disk_usage(ROOT).free:
        raise RuntimeError('Insufficient storage for new portable copy')
    plan_name = 'verification/sparse-recipe-plan-v4-20261116.json'
    plan = json.loads((ROOT / plan_name).read_text())
    names = [*plan['source_sha256'], *plan['artifact_sha256'], plan_name,
             'sparse_recipe_audit_v4.py', 'sparse_recipe_package_v4.py', 'sparse_recipe_report.py',
             'tests/test_sparse_recipe_v3.py', 'tests/test_sparse_recipe_report.py',
             'SPARSE_RECIPE_DATA_V4_REPRODUCTION.he.md', 'SPARSE_RECIPE_DATA_V4_RESULTS.he.md',
             'PROJECT_WORK_PLAN.he.md', 'README.he.md', 'RESEARCH_LOG.he.md',
             'verification/sparse-recipe-results-v4-20261116.json']
    names += [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'verification/qwen-sparse-source-20261116').rglob('*')) if p.is_file()]
    names += [str((run / n).relative_to(ROOT)) for n in ['results.zip', 'archive-manifest.json', 'recovery.json', 'remote-status.json', 'remote.log', 'material.zip']]
    files = {name: (ROOT / name).read_bytes() for name in sorted(set(names))}
    for name, expected in {**plan['source_sha256'], **plan['artifact_sha256']}.items():
        assert sha(files[name]) == expected, name
    files['README-PACKET.txt'] = (
        'Matched sparse-recipe data intervention,2026-11-16.\n'
        'Read SPARSE_RECIPE_DATA_V4_RESULTS.he.md and REPRODUCTION instructions first.\n'
        'Two fresh adapters, original fixed engine/model/hyperparameters; common navigation clarification.\n'
        'Each TRAIN360, development160 in80 matched language pairs, exposed regression120.\n'
        '1680 repeated case outputs are not1680 independent scenarios.\n'
        'Primary decision compares step160 for both arms on the new-recipe/new-frame40-case cell.\n'
        'Nested runs/.../results.zip retains all responses and four adapter/optimizer checkpoints.\n'
        'Base public weights and runtime dependencies are separate pinned downloads.\n'
        'No credentials, SSH identity, usage logs, user audio or old held tests included.\n'
        'Actual T4 training/inference only; no browser,quantization or physical-phone validation.\n'
        'Historical links in project docs can refer to the complete repository.\n'
    ).encode()
    manifest = {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in sorted(files.items())}
    files['MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    with zipfile.ZipFile(packet, 'x', zipfile.ZIP_DEFLATED) as dst:
        for name, data in files.items():
            dst.writestr(name, data, compress_type=zipfile.ZIP_STORED if name.endswith('.zip') else zipfile.ZIP_DEFLATED)
    with tempfile.TemporaryDirectory(prefix='sparse-v4-packet-') as directory:
        with zipfile.ZipFile(packet) as src:
            assert src.testzip() is None
            for name, expected in manifest.items():
                data = src.read(name)
                assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], name
                if name.endswith(('.py', '.json', '.md', '.txt')):
                    path = Path(directory) / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
        tests = subprocess.run(['python', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_sparse_recipe*.py', '-v'],
                               cwd=directory, text=True, capture_output=True)
        stdout = tests.stdout + tests.stderr
        (ROOT / 'verification/sparse-recipe-packet-tests-v4-20261116.txt').write_text(stdout)
        assert tests.returncode == 0 and re.search(r'Ran 17 tests', stdout) and stdout.rstrip().endswith('OK')
    with packet.open('rb') as src: digest = hashlib.file_digest(src, 'sha256').hexdigest()
    proof = {'file': str(packet), 'bytes': packet.stat().st_size, 'sha256': digest,
             'members': len(files), 'manifest_entries': len(manifest), 'crc_verified': True,
             'all_manifest_members_verified': True, 'extracted_source_tests_passed': 17,
             'original_results_archive_and_four_adapter_optimizer_checkpoints_bundled': True,
             'base_weights_bundled': False, 'account_state_bundled': False}
    proof_path.write_text(json.dumps(proof, indent=2) + '\n'); print(json.dumps(proof, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('run'); args = parser.parse_args(); package(args.run)

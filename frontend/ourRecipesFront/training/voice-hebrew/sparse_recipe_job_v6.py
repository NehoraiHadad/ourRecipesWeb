"""Remote bounded job. No authentication, Drive mount or publishing in the VM."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import zipfile


def execute(bundle, output, expected_sha):
    output = Path(output); output.mkdir(exist_ok=False)
    started = time.monotonic(); state = {'status': 'running'}

    def update(phase, **fields):
        state.update(phase=phase, seconds=time.monotonic() - started, **fields)
        (output / 'status.json').write_text(json.dumps(state, indent=2) + '\n')
        print(json.dumps(state), flush=True)

    def call(argv, phase, timeout):
        update(phase)
        process = subprocess.Popen(argv, cwd=material, start_new_session=True,
                  env={**os.environ, 'HF_HOME': str(output / 'hf-cache'), 'HF_HUB_DISABLE_TELEMETRY': '1',
                       'TOKENIZERS_PARALLELISM': 'false', 'PYTHONUNBUFFERED': '1'})
        try:
            code = process.wait(timeout=timeout)
            if code:
                raise RuntimeError(f'{phase} exited {code}')
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL); process.wait()
            raise

    try:
        with Path(bundle).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected_sha:
                raise ValueError('Uploaded material hash mismatch')
        material = output / 'material'; material.mkdir()
        with zipfile.ZipFile(bundle) as archive:
            if archive.testzip() or sum(i.file_size for i in archive.infolist()) > 12 * 1024**2:
                raise ValueError('Invalid material archive')
            if any(Path(n).is_absolute() or '..' in Path(n).parts for n in archive.namelist()):
                raise ValueError('Unsafe material path')
            archive.extractall(material)
        plan = json.loads((material / 'verification/sparse-recipe-plan-v6-20261116.json').read_text())
        gpu = subprocess.check_output(['nvidia-smi', '--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'], text=True)
        if 'T4' not in gpu:
            raise ValueError('Expected actual T4')
        (output / 'hardware.json').write_text(json.dumps({'gpu': gpu.strip(), 'host_python': sys.version}) + '\n')
        uv = shutil.which('uv')
        if not uv:
            call([sys.executable, '-m', 'pip', 'install', 'uv==0.9.5'], 'bootstrap_uv', 90)
            uv = shutil.which('uv')
        call([uv, 'venv', '--python', '3.13', '--seed', str(output / 'venv')], 'python313', 180)
        python = str(output / 'venv/bin/python')
        call([python, '-m', 'pip', 'install', 'torch==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cu124'], 'torch', 360)
        call([python, '-m', 'pip', 'install', *plan['dependencies']], 'dependencies', 180)
        (output / 'pip-freeze.txt').write_text(subprocess.check_output([python, '-m', 'pip', 'freeze'], text=True))
        call([python, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_sparse_recipe_v6.py', '-v'], 'contract_tests', 60)
        call([python, str(material / 'sparse_recipe_reference_v6.py'), str(output / 'study')], 'pilot', plan['max_study_seconds'])
        update('complete', status='complete')
    except BaseException as error:
        update('failed', status='failed', error=str(error), error_type=type(error).__name__)
        raise
    finally:
        archive = Path(str(output) + '-results.zip')
        manifest = {}
        with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as dest:
            retained = [output / n for n in ['status.json', 'hardware.json', 'pip-freeze.txt']]
            retained += sorted((output / 'study').rglob('*'))
            for path in retained:
                if path.is_file():
                    name = str(path.relative_to(output))
                    data = path.read_bytes()
                    dest.writestr(name, data)
                    manifest[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            dest.writestr('MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
        with archive.open('rb') as stream:
            sha = hashlib.file_digest(stream, 'sha256').hexdigest()
        Path(str(archive) + '.manifest.json').write_text(json.dumps({'sha256': sha, 'bytes': archive.stat().st_size}) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--bundle', required=True)
    parser.add_argument('--output', required=True); parser.add_argument('--sha256', required=True)
    args = parser.parse_args(); execute(args.bundle, args.output, args.sha256)

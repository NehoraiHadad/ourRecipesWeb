"""Run the frozen V12 study and archive both arms on its Colab VM."""
import argparse
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import subprocess
import sys
import time
import zipfile

PLAN_FILE = 'verification/semantic-supervision-plan-v12-20261118.json'
PREFLIGHT_FILE = 'verification/semantic-supervision-preflight-v12-20261118.json'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.partial')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def safe_path(name):
    path = PurePosixPath(name)
    return bool(path.parts) and not path.is_absolute() and '..' not in path.parts and '\\' not in name


def unpack(bundle, material, expected_sha):
    if digest(bundle) != expected_sha:
        raise ValueError('Upload SHA mismatch')
    with zipfile.ZipFile(bundle) as archive:
        members = archive.namelist()
        if (len(set(members)) != len(members) or any(not safe_path(name) for name in members)
                or sum(info.file_size for info in archive.infolist()) > 12 * 1024**2 or archive.testzip()):
            raise ValueError('Invalid material archive')
        archive.extractall(material)


def archive_results(output):
    archive = output.with_name(output.name + '-results.zip')
    inner = {}
    files = [output / name for name in ('status.json', 'hardware.json', 'pip-freeze.txt', 'job.log', 'preflight.json')]
    files.extend(sorted((output / 'study').rglob('*')))
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=3) as destination:
        for path in files:
            if path.is_file():
                name = path.relative_to(output).as_posix()
                destination.write(path, name)
                inner[name] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
        destination.writestr('MANIFEST.json', json.dumps(inner, indent=2) + '\n')
    write_json(archive.with_suffix('.zip.manifest.json'), {'sha256': digest(archive), 'bytes': archive.stat().st_size})


def execute(bundle, output, expected_sha):
    output.mkdir()
    material = output / 'material'
    started = time.monotonic()

    def status(phase, **fields):
        write_json(output / 'status.json', {'phase': phase, 'seconds': time.monotonic() - started, **fields})

    env = {**os.environ, 'HF_HOME': str(output / 'hf-cache'), 'HF_HUB_DISABLE_IMPLICIT_TOKEN': '1',
           'HF_HUB_DISABLE_TELEMETRY': '1', 'TOKENIZERS_PARALLELISM': 'false', 'PYTHONUNBUFFERED': '1'}

    def call(argv, phase, limit, *, capture=None):
        status(phase)
        with ExitStack() as stack:
            log = stack.enter_context((output / 'job.log').open('ab'))
            stdout = stack.enter_context(capture.open('xb')) if capture else log
            process = subprocess.Popen(argv, cwd=material, env=env, start_new_session=True,
                                       stdin=subprocess.DEVNULL, stdout=stdout, stderr=log)
            try:
                if process.wait(timeout=limit):
                    raise RuntimeError(f'{phase} exited {process.returncode}')
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()

    try:
        status('verify_material')
        unpack(bundle, material, expected_sha)
        plan = json.loads((material / PLAN_FILE).read_text())
        hardware = subprocess.check_output(['nvidia-smi', '--query-gpu=name,memory.total,driver_version',
                                            '--format=csv,noheader'], text=True).strip().splitlines()
        if len(hardware) != 1 or plan['runtime']['gpu'] not in hardware[0]:
            raise ValueError('The study requires exactly one physical T4')
        write_json(output / 'hardware.json', {'gpu': hardware[0], 'host_python': sys.version})

        uv = shutil.which('uv')
        if uv is None:
            call([sys.executable, '-m', 'pip', 'install', 'uv==0.9.5'], 'bootstrap_uv', 90)
            uv = shutil.which('uv')
        call([uv, 'venv', '--python', '3.13', '--seed', str(output / 'venv')], 'python313', 180)
        python = str(output / 'venv/bin/python')
        torch = plan['runtime']['torch']
        call([python, '-m', 'pip', 'install', f'torch=={torch}', '--index-url',
              'https://download.pytorch.org/whl/cu124'], 'torch', 360)
        call([python, '-m', 'pip', 'install', *plan['dependencies']], 'dependencies', 180)
        call([python, '-m', 'pip', 'freeze'], 'freeze_environment', 30, capture=output / 'pip-freeze.txt')
        call([python, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_semantic_supervision_v12.py', '-v'],
             'contract_tests', 90)

        preflight = """
import json
from pathlib import Path
from huggingface_hub import snapshot_download
from semantic_supervision_data_v12 import read_native, read_labels
from semantic_supervision_v12 import load_tokenizer, preflight, read_plan, verify_freeze
verify_freeze()
plan = read_plan()
model = plan['model']
folder = Path(snapshot_download(model['repo'], revision=model['revision'],
                                allow_patterns=list(plan['tokenizer_sha256']), token=False))
report = preflight(load_tokenizer(folder, plan), plan, read_native(), read_labels())
expected = json.loads(Path(%r).read_text())
expected.pop('tokenizer_environment')
if report != expected:
    raise ValueError('VM tokenizer preflight differs from frozen CPU evidence')
print(json.dumps(report, ensure_ascii=False, indent=2))
""" % PREFLIGHT_FILE
        call([python, '-c', preflight], 'tokenizer_preflight', 180, capture=output / 'preflight.json')
        call([python, 'semantic_supervision_train_v12.py', str(output / 'study')], 'study',
             plan['runtime']['study_seconds'])
        status('complete', status='complete')
    except BaseException as error:
        status('failed', status='failed', error_type=type(error).__name__, error=str(error))
        raise
    finally:
        archive_results(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    execute(args.bundle, args.output, args.sha256)

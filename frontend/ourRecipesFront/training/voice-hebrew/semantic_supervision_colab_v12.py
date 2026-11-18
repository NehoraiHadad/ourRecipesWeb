"""Own or reconnect to one named V12 T4 and collect its immutable results."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import zipfile

from semantic_supervision_job_v12 import digest, safe_path, write_json
from semantic_supervision_v12 import ARMS, MANIFEST, ROOT, verify_freeze

JOB = 'semantic_supervision_job_v12.py'
STATUS_LABEL = 'V12_STATUS='
WATCH_SECONDS = 5400


def bundle_material(path):
    verify_freeze()
    manifest = json.loads(MANIFEST.read_text())['sha256']
    names = set(manifest) | {MANIFEST.relative_to(ROOT).as_posix(), JOB}
    with zipfile.ZipFile(path, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(names):
            archive.write(ROOT / name, name)
    return digest(path)


def validate_archive(archive, manifest, recovered):
    import hashlib

    if archive.stat().st_size != manifest['bytes'] or digest(archive) != manifest['sha256']:
        raise ValueError('Results archive SHA or size mismatch')
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        if len(set(names)) != len(names) or any(not safe_path(name) for name in names) or source.testzip():
            raise ValueError('Results archive paths or CRC invalid')
        inner = json.loads(source.read('MANIFEST.json'))
        if set(names) != set(inner) | {'MANIFEST.json'}:
            raise ValueError('Results archive differs from manifest')
        for name, expected in inner.items():
            with source.open(name) as stream:
                actual_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
            if source.getinfo(name).file_size != expected['bytes'] or actual_sha != expected['sha256']:
                raise ValueError(f'Member SHA or size mismatch: {name}')
        for name in inner:
            if Path(name).suffix not in {'.pt', '.safetensors'}:
                target = recovered / name
                target.parent.mkdir(parents=True, exist_ok=True)
                content = source.read(name)
                if target.exists():
                    if target.read_bytes() != content:
                        raise ValueError(f'Existing recovered member differs: {name}')
                else:
                    temporary = target.with_suffix(target.suffix + '.partial')
                    temporary.write_bytes(content)
                    temporary.replace(target)
    return len(inner)


class Owner:
    def __init__(self, args, folder):
        self.session = args.session
        self.folder = folder
        self.identity = str(args.ssh_identity.resolve())
        self.config = folder / 'sessions-private.json'
        self.prefix = [args.cli, '--auth=adc', '--config', str(self.config)]
        self.remote = '/content/' + self.session
        self.archive_path = self.remote + '-results.zip'
        self.bundle_path = self.remote + '-material.zip'
        self.state = folder / 'owner-state.json'

    def record(self, phase, **fields):
        write_json(self.state, {'session': self.session, 'phase': phase, **fields})
        print(phase, flush=True)

    def cli(self, args, *, limit=90, stdout=subprocess.PIPE):
        # Keep account metadata and provider errors in the private local run directory.
        with (self.folder / 'transport-private.log').open('ab') as diagnostics:
            return subprocess.run([*self.prefix, *args], stdin=subprocess.DEVNULL, stdout=stdout,
                                  stderr=diagnostics, timeout=limit, check=True).stdout

    def ssh(self, *argv, limit=90, stdout=subprocess.PIPE):
        return self.cli(['ssh', '-s', self.session, '-i', self.identity, '--', *argv], limit=limit, stdout=stdout)

    def python(self, code):
        lines = self.ssh('python3', '-c', code).decode().splitlines()
        response = next((line.removeprefix(STATUS_LABEL) for line in lines if line.startswith(STATUS_LABEL)), None)
        if response is None:
            raise ValueError('Missing structured response from assigned V12 VM')
        return json.loads(response)

    def start_job(self, sha):
        code = f"""import hashlib,json,subprocess,sys,zipfile
from pathlib import Path
log_path=Path({self.remote!r}+'-launch.log')
if log_path.exists():
    print({STATUS_LABEL!r}+json.dumps({{'already_requested':True}}))
    raise SystemExit(0)
bundle=Path({self.bundle_path!r})
with bundle.open('rb') as stream:
    if hashlib.file_digest(stream, 'sha256').hexdigest()!={sha!r}:
        raise ValueError('Uploaded package SHA mismatch')
script=Path({self.remote!r}+'-job.py')
with zipfile.ZipFile(bundle) as archive:
    script.write_bytes(archive.read({JOB!r}))
with log_path.open('x') as log:
    try:
        process=subprocess.Popen([sys.executable,'-u',str(script),'--bundle',str(bundle),
            '--output',{self.remote!r},'--sha256',{sha!r}],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    except OSError:
        log_path.unlink()
        raise
print({STATUS_LABEL!r}+json.dumps({{'pid':process.pid}}))
"""
        self.record('launch_requested')
        info = self.python(code)
        self.record('started', **info)

    def read_status(self):
        code = f"""import json
from pathlib import Path
root=Path({self.remote!r})
status=root/'status.json'
state=json.loads(status.read_text()) if status.exists() else {{'phase':'starting'}}
manifest=Path({self.archive_path!r}+'.manifest.json')
if manifest.exists():
    state['archive']=json.loads(manifest.read_text())
state['arms']={{}}
for arm in {ARMS!r}:
    path=root/'study'/arm/'training.jsonl'
    if path.exists():
        complete=path.read_text().splitlines()
        while complete:
            try:
                state['arms'][arm]=json.loads(complete[-1])['step']
                break
            except json.JSONDecodeError:
                complete.pop()
print({STATUS_LABEL!r}+json.dumps(state))
"""
        return self.python(code)

    def wait_for_archive(self):
        deadline = time.monotonic() + WATCH_SECONDS
        previous = None
        while time.monotonic() < deadline:
            try:
                state = self.read_status()
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
                time.sleep(25)
                continue
            write_json(self.folder / 'remote-status.json', state)
            progress = {'phase': state['phase'], 'updates': state['arms']}
            if progress != previous:
                print(json.dumps(progress), flush=True)
                previous = progress
            if 'archive' in state:
                return state
            time.sleep(25)
        raise TimeoutError('V12 collection deadline reached; reconnect to the existing assignment')

    def download(self, manifest):
        complete = self.folder / 'results.zip'
        partial = self.folder / 'results.zip.download-partial'
        if not complete.exists():
            for attempt in range(5):
                offset = partial.stat().st_size if partial.exists() else 0
                if offset > manifest['bytes'] or manifest['bytes'] - offset > shutil.disk_usage(self.folder).free:
                    raise ValueError('Invalid partial archive or insufficient space')
                if offset == manifest['bytes']:
                    break
                code = (f'import sys,shutil; f=open({self.archive_path!r}, "rb"); '
                        f'f.seek({offset}); shutil.copyfileobj(f,sys.stdout.buffer)')
                try:
                    with partial.open('ab') as stream:
                        self.ssh('python3', '-c', code, limit=300, stdout=stream)
                except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                    if attempt == 4:
                        raise
                    time.sleep(25)
            if partial.stat().st_size != manifest['bytes'] or digest(partial) != manifest['sha256']:
                partial.rename(partial.with_name(f'{partial.name}.unverified-{time.time_ns()}'))
                raise ValueError('Transfer could not be verified; reconnect to download the intact remote archive')
            partial.rename(complete)
        return complete

    def release(self):
        self.cli(['stop', '-s', self.session], limit=120)
        status = self.cli(['status', '-s', self.session]).decode()
        if f"Session '{self.session}' not found." not in status:
            raise RuntimeError('Colab still reports the assigned V12 VM')
        self.record('stopped')

    def collect(self):
        state = self.wait_for_archive()
        archive = self.download(state['archive'])
        members = validate_archive(archive, state['archive'], self.folder / 'recovered')
        write_json(self.folder / 'recovery.json', {**state['archive'], 'member_count': members,
                                                  'sha_verified': True, 'crc_verified': True,
                                                  'all_members_verified': True, 'status': state['status']})
        self.record('verified')
        self.release()
        if state['status'] != 'complete':
            raise RuntimeError('Remote V12 job failed; verified evidence was retained and the VM was stopped')


def run(args):
    if not re.fullmatch(r'ourrecipes-v12-[a-z0-9-]{1,45}', args.session):
        raise ValueError('Set a dedicated ourrecipes-v12-* session name')
    adc = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if not adc or not Path(adc).is_file() or not args.ssh_identity.is_file():
        raise ValueError('Provide local ADC and SSH identity before requesting a VM')
    runs = ROOT / 'runs'
    runs.mkdir(exist_ok=True)
    folder = runs / args.session
    if not args.resume:
        folder.mkdir(mode=0o700)
    elif not (folder / 'sessions-private.json').is_file():
        raise ValueError('No original Colab config. Reconcile the original assignment before proceeding.')
    with (folder / 'owner.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        owner = Owner(args, folder)
        if args.resume:
            phase = json.loads(owner.state.read_text())['phase']
            if phase == 'stopped':
                print('stopped', flush=True)
                return
            if phase == 'verified':
                owner.release()
                return
            if phase == 'allocation_requested':
                status = owner.cli(['status', '-s', owner.session]).decode()
                if f"Session '{owner.session}' not found." in status:
                    raise RuntimeError('Original allocation cannot be confirmed. Never retry by allocating another VM.')
                owner.record('allocated')
                phase = 'allocated'
            if phase in {'allocated', 'uploaded', 'launch_requested'}:
                package = folder / 'material.zip'
                if phase == 'allocated':
                    owner.cli(['upload', '-s', owner.session, str(package), owner.bundle_path])
                    owner.record('uploaded')
                owner.start_job(digest(package))
        else:
            package = folder / 'material.zip'
            sha = bundle_material(package)
            owner.cli(['sessions'])
            owner.record('allocation_requested')
            owner.cli(['new', '-s', args.session, '--gpu', 'T4'], limit=240)
            owner.record('allocated')
            owner.cli(['upload', '-s', args.session, str(package), owner.bundle_path])
            owner.record('uploaded')
            owner.start_job(sha)
        owner.collect()


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--session', required=True)
    parser.add_argument('--ssh-identity', required=True, type=Path)
    parser.add_argument('--cli', default='colab')
    parser.add_argument('--resume', action='store_true')
    run(parser.parse_args())

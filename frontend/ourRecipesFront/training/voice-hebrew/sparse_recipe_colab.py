"""Own one named T4, recover artifacts with SHA checks, always release the VM."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import signal
import subprocess
import time
import zipfile

ROOT = Path(__file__).resolve().parent


def run(args):
    if not re.fullmatch(r'ourrecipes-[a-z0-9-]{1,55}', args.session):
        raise ValueError('Dedicated named session required')
    plan = json.loads((ROOT / 'verification/sparse-recipe-plan-v3-20261116.json').read_text())
    for name, expected in plan['source_sha256'].items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
            raise ValueError('Source mismatch: ' + name)
    output = ROOT / 'runs' / args.session; output.mkdir(exist_ok=False)
    prefix = [args.cli, '--auth=adc', '--config', str(output / 'sessions-private.json')]
    active = False; events = []; started = time.monotonic()
    remote = '/content/' + args.session

    def cli(argv, timeout=90):
        result = subprocess.run([*prefix, *argv], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError('Colab ' + argv[0] + ': ' + result.stderr[-1800:] + result.stdout[-1000:])
        return result.stdout

    def execute(code):
        text = cli(['ssh', '-s', args.session, '-i', args.ssh_identity, '--', 'python3', '-c', code])
        line = next((l.split('=', 1)[1] for l in text.splitlines() if l.startswith('PILOT_STATUS=')), None)
        if line is None:
            raise ValueError('Missing structured SSH output')
        return json.loads(line)

    try:
        material = output / 'material.zip'
        with zipfile.ZipFile(material, 'x', zipfile.ZIP_DEFLATED) as archive:
            names = list(plan['source_sha256']) + [plan['data_file'], 'verification/sparse-recipe-plan-v3-20261116.json']
            for name in sorted(set(names)):
                archive.write(ROOT / name, name)
        sha = hashlib.sha256(material.read_bytes()).hexdigest()
        events.append({'phase': 'before', 'usage': cli(['usage'])})
        active = True
        print(cli(['new', '-s', args.session, '--gpu', 'T4'], 180), flush=True)
        cli(['upload', '-s', args.session, str(material), '/content/sparse-material.zip'])
        code = f'''import hashlib,json,subprocess,sys,zipfile
from pathlib import Path
p=Path('/content/sparse-material.zip')
assert hashlib.sha256(p.read_bytes()).hexdigest()=={sha!r}
with zipfile.ZipFile(p) as z:Path('/content/sparse-job.py').write_bytes(z.read('sparse_recipe_job.py'))
log=Path({remote!r}+'.log').open('x')
proc=subprocess.Popen([sys.executable,'-u','/content/sparse-job.py','--bundle',str(p),'--output',{remote!r},'--sha256',{sha!r}],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
print('PILOT_STATUS='+json.dumps({{'pid':proc.pid}}))'''
        print(execute(code), flush=True)
        while True:
            if time.monotonic() - started > plan['max_owner_seconds']:
                raise TimeoutError('Local T4 owner watchdog')
            code = f'''import json
from pathlib import Path
p=Path({remote!r})
s=json.loads((p/'status.json').read_text()) if (p/'status.json').exists() else {{'phase':'starting'}}
s['archive_ready']=Path({remote!r}+'-results.zip.manifest.json').exists()
s['progress']=json.loads((p/'study/progress.json').read_text()) if (p/'study/progress.json').exists() else None
print('PILOT_STATUS='+json.dumps(s))'''
            for attempt in range(3):
                try:
                    status = execute(code); break
                except (RuntimeError, subprocess.TimeoutExpired):
                    if attempt == 2:
                        raise
                    time.sleep(3)
            (output / 'remote-status.json').write_text(json.dumps(status, indent=2) + '\n')
            print(json.dumps(status), flush=True)
            if status['archive_ready']:
                break
            time.sleep(20)
        manifest = execute(f"import json;from pathlib import Path;print('PILOT_STATUS='+Path({remote!r}+'-results.zip.manifest.json').read_text())")
        (output / 'archive-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        archive = output / 'results.zip'
        if manifest['bytes'] + 8 * 1024**2 > shutil.disk_usage(output).free:
            raise RuntimeError('Not enough local storage for verified recovery')
        with archive.open('xb') as dest:
            completed = subprocess.run([*prefix, 'ssh', '-s', args.session, '-i', args.ssh_identity, '--', 'cat', remote + '-results.zip'],
                        stdin=subprocess.DEVNULL, stdout=dest, stderr=subprocess.PIPE, timeout=180)
        if completed.returncode:
            raise RuntimeError('SSH result transfer failed')
        with archive.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['sha256']
        assert archive.stat().st_size == manifest['bytes']
        with zipfile.ZipFile(archive) as src:
            assert src.testzip() is None
            members = src.namelist()
            assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in members)
            internal = json.loads(src.read('MANIFEST.json'))
            assert set(members) == set(internal) | {'MANIFEST.json'}
            extract_weights = sum(i.file_size for i in src.infolist()) + 8 * 1024**2 < shutil.disk_usage(output).free
            for name, expected in internal.items():
                data = src.read(name)
                assert len(data) == expected['bytes'] and hashlib.sha256(data).hexdigest() == expected['sha256'], name
                if extract_weights or Path(name).suffix not in ('.pt', '.safetensors'):
                    path = output / 'recovered' / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
        log = cli(['ssh', '-s', args.session, '-i', args.ssh_identity, '--', 'cat', remote + '.log'])
        (output / 'remote.log').write_text(log)
        (output / 'recovery.json').write_text(json.dumps({'sha_verified': True, 'crc_verified': True, 'all_members_verified': True,
                         'members': len(internal), 'weights_extracted': extract_weights, 'all_weights_retained_in_archive': True}, indent=2) + '\n')
        events.append({'phase': 'before_cleanup', 'usage': cli(['usage'])})
        if status['status'] != 'complete':
            raise RuntimeError('Job failed; evidence recovered: ' + str(status))
    finally:
        if active:
            try:
                print(cli(['stop', '-s', args.session], 120), flush=True)
            finally:
                events.append({'phase': 'after_cleanup', 'usage': cli(['usage'])})
        events.append({'phase': 'finished', 'seconds': time.monotonic() - started})
        (output / 'usage-private.json').write_text(json.dumps(events, indent=2) + '\n')


if __name__ == '__main__':
    def term(signum, frame):
        raise SystemExit('Interrupted; release dedicated runtime')
    signal.signal(signal.SIGTERM, term)
    parser = argparse.ArgumentParser(); parser.add_argument('--session', required=True)
    parser.add_argument('--ssh-identity', required=True); parser.add_argument('--cli', default='colab')
    run(parser.parse_args())

"""Recover a named existing job after local reconnect. Never allocates a VM."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import zipfile


def recover(run, session, identity):
    run = Path(run).resolve()
    if not re.fullmatch(r'ourrecipes-[a-z0-9-]{1,55}', session) or run.name != session:
        raise ValueError('Exact existing dedicated run/session required')
    config = run / 'sessions-private.json'
    if not config.exists(): raise FileNotFoundError('Missing original assignment; do not allocate another VM')
    prefix = ['colab', '--auth=adc', '--config', str(config)]
    remote = '/content/' + session; events = []; started = time.monotonic(); verified = False

    def cli(args, timeout=90):
        p = subprocess.run([*prefix, *args], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
        if p.returncode: raise RuntimeError(args[0] + ': ' + p.stderr[-1500:] + p.stdout[-500:])
        return p.stdout

    def execute(code):
        text = cli(['ssh', '-s', session, '-i', identity, '--', 'python3', '-c', code])
        row = next((s.split('=', 1)[1] for s in text.splitlines() if s.startswith('RECOVERY=')), None)
        if row is None: raise ValueError('Missing structured recovery response')
        return json.loads(row)

    try:
        events.append({'phase': 'reconnect', 'usage': cli(['usage'])})
        while True:
            if time.monotonic() - started > 3600: raise TimeoutError('Recovery watchdog')
            status = execute(f"import json;from pathlib import Path;p=Path({remote!r});s=json.loads((p/'status.json').read_text()) if (p/'status.json').exists() else {{'phase':'starting'}};s['archive_ready']=Path({remote!r}+'-results.zip.manifest.json').exists();s['progress']=json.loads((p/'study/progress.json').read_text()) if (p/'study/progress.json').exists() else None;print('RECOVERY='+json.dumps(s))")
            (run / 'remote-status.json').write_text(json.dumps(status, indent=2) + '\n')
            print(json.dumps(status), flush=True)
            if status['archive_ready']: break
            time.sleep(20)
        manifest = execute(f"from pathlib import Path;print('RECOVERY='+Path({remote!r}+'-results.zip.manifest.json').read_text())")
        mpath = run / 'archive-manifest.json'
        if mpath.exists(): assert json.loads(mpath.read_text()) == manifest
        else: mpath.write_text(json.dumps(manifest, indent=2) + '\n')
        archive = run / 'results.zip'; partial = run / 'results.zip.download-partial'
        if not archive.exists():
            offset = partial.stat().st_size if partial.exists() else 0
            assert offset <= manifest['bytes']
            if manifest['bytes'] - offset + 4 * 1024**2 > shutil.disk_usage(run).free:
                raise RuntimeError('Insufficient space for complete immutable archive; keep original VM for recovery')
            code = f"import sys,shutil;f=open({remote!r}+'-results.zip','rb');f.seek({offset});shutil.copyfileobj(f,sys.stdout.buffer)"
            with partial.open('ab') as stream:
                p = subprocess.run([*prefix, 'ssh', '-s', session, '-i', identity, '--', 'python3', '-c', code],
                                   stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.PIPE, timeout=240)
            if p.returncode: raise RuntimeError('Resumable result stream failed')
            assert partial.stat().st_size == manifest['bytes']
            with partial.open('rb') as stream: assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['sha256']
            partial.rename(archive)
        with archive.open('rb') as stream: assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['sha256']
        with zipfile.ZipFile(archive) as src:
            assert src.testzip() is None
            inner = json.loads(src.read('MANIFEST.json'))
            assert set(src.namelist()) == set(inner) | {'MANIFEST.json'}
            for name, expected in inner.items():
                assert not Path(name).is_absolute() and '..' not in Path(name).parts
                raw = src.read(name)
                assert len(raw) == expected['bytes'] and hashlib.sha256(raw).hexdigest() == expected['sha256'], name
                if Path(name).suffix not in ('.pt', '.safetensors'):
                    target = run / 'recovered' / name; target.parent.mkdir(parents=True, exist_ok=True)
                    if target.exists(): assert target.read_bytes() == raw
                    else: target.write_bytes(raw)
        log = cli(['ssh', '-s', session, '-i', identity, '--', 'cat', remote + '.log'])
        (run / 'remote.log').write_text(log)
        (run / 'recovery.json').write_text(json.dumps({'sha_verified': True, 'crc_verified': True,
            'all_members_verified': True, 'members': len(inner), 'weights_extracted': False,
            'all_weights_retained_in_archive': True, 'recovered_after_local_reconnect': True}, indent=2) + '\n')
        verified = True
        print(cli(['stop', '-s', session], 120), flush=True)
        events.append({'phase': 'after_cleanup', 'usage': cli(['usage'])})
        if status.get('status') != 'complete': raise RuntimeError('Remote job failed; original artifacts recovered and VM stopped')
    finally:
        events.append({'phase': 'recovery_finished', 'seconds': time.monotonic() - started,
                       'verified': verified, 'new_vm_allocated': False})
        (run / 'reconnect-usage-private.json').write_text(json.dumps(events, indent=2) + '\n')
        if not verified: print('RECOVERY_PENDING: original VM retained; retry recovery, never allocate a duplicate.', flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('run'); p.add_argument('--session', required=True); p.add_argument('--ssh-identity', required=True)
    a = p.parse_args(); recover(a.run, a.session, a.ssh_identity)

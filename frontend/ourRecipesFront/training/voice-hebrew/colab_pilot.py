"""Explicit Colab CLI pilot driver; always stop the session it creates/reuses.

Requires authenticated colab CLI. Only the prepared synthetic ZIP and remote job
script are uploaded. No credentials, application files or user audio are sent.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import zipfile
from corpus import ROOT
from prepare import bundle
from engine import verify_manifest


def run(args):
    session=args.session
    if not re.fullmatch(r'ourrecipes-[a-z0-9-]{1,55}',session):raise ValueError('Use a dedicated ourrecipes-* session name')
    output=Path(args.output)
    output.mkdir(parents=True,exist_ok=False)
    events=[];started=time.monotonic();active=args.reuse
    def cli(argv,timeout=90,quiet=False):
        prefix=[args.cli]+(["--auth="+args.auth_provider] if args.auth_provider else [])
        result=subprocess.run([*prefix,*argv],capture_output=True,text=True,timeout=timeout)
        if not quiet:print(result.stdout+result.stderr,flush=True)
        if result.returncode:raise RuntimeError(f'Colab {argv[0]} failed: '+result.stdout[-1500:]+result.stderr[-1500:])
        return result.stdout
    def execute(code):
        script=output/'probe.py';script.write_text(code)
        text=cli(['exec','-s',session,'-f',str(script),'--timeout','60'],quiet=True)
        prefix='OURRECIPES_STATUS='
        line=next((line[len(prefix):] for line in text.splitlines() if line.startswith(prefix)),None)
        if line is None:raise RuntimeError('No structured Colab response: '+text[-1500:])
        return json.loads(line)
    try:
        verify_manifest(ROOT/'data')
        material=output/'material.zip';bundle(material)
        with material.open('rb') as handle:
            sha=hashlib.file_digest(handle,'sha256').hexdigest()
        events.append({'phase':'before','usage':cli(['usage'],quiet=True)})
        if not args.reuse:
            active=True
            cli(['new','-s',session,'--gpu','T4'],timeout=180)
        active=True
        cli(['upload','-s',session,str(material),'/content/ourrecipes-material.zip'])
        cli(['upload','-s',session,str(ROOT/'colab_job.py'),'/content/ourrecipes-job.py'])
        remote='/content/'+args.run_id
        launch=f'''import subprocess,sys,json
from pathlib import Path
log=Path({remote!r}+'.log').open('w')
ourrecipes_process=subprocess.Popen([sys.executable,'-u','/content/ourrecipes-job.py','--bundle','/content/ourrecipes-material.zip','--output',{remote!r},'--sha256',{sha!r},'--steps',{str(args.steps)!r},'--max-seconds',{str(args.max_seconds)!r},'--python-version',{args.python_version!r},'--baseline-steps',{str(args.baseline_steps)!r}],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
Path({remote!r}+'.pid').write_text(str(ourrecipes_process.pid))
print('OURRECIPES_STATUS='+json.dumps({{'pid':ourrecipes_process.pid}}))
'''
        print(execute(launch),flush=True)
        while True:
            if time.monotonic()-started>args.max_seconds+300:raise TimeoutError('Local pilot watchdog expired')
            probe=f'''import json
from pathlib import Path
p=Path({remote!r})
s=json.loads((p/'status.json').read_text()) if (p/'status.json').exists() else {{'phase':'starting'}}
s['process_exit']=ourrecipes_process.poll() if 'ourrecipes_process' in globals() else (0 if s.get('status')=='complete' else None)
s['archive_ready']=Path({remote!r}+'-results.zip.manifest.json').exists()
s['log_tail']=Path({remote!r}+'.log').read_text(errors='replace')[-1800:]
print('OURRECIPES_STATUS='+json.dumps(s))
'''
            for attempt in range(3):
                try:
                    status=execute(probe)
                    break
                except (subprocess.TimeoutExpired,RuntimeError) as error:
                    if attempt==2:raise
                    print(f'Read-only status poll failed ({type(error).__name__}); retrying without restarting training',flush=True)
                    time.sleep(5)
            (output/'remote-status.json').write_text(json.dumps(status,indent=2))
            print(json.dumps({k:v for k,v in status.items() if k!='log_tail'},ensure_ascii=False),flush=True)
            print(status.get('log_tail','')[-700:],flush=True)
            if status.get('process_exit') is not None:
                if not status['archive_ready']:raise RuntimeError('Remote job ended without recovery archive: '+status.get('log_tail',''))
                break
            time.sleep(15)
        cli(['download','-s',session,remote+'-results.zip.manifest.json',str(output/'archive-manifest.json')])
        manifest=json.loads((output/'archive-manifest.json').read_text())
        archive=output/'results.zip'
        with archive.open('wb') as dest:
            for part in manifest['parts']:
                remaining=args.max_seconds+300-(time.monotonic()-started)
                if remaining<=0:raise TimeoutError('Artifact recovery exceeded the local pilot deadline')
                local=output/part['name']
                cli(['download','-s',session,'/content/'+part['name'],str(local)],timeout=min(120,remaining),quiet=True)
                content=local.read_bytes()
                if len(content)!=part['bytes'] or hashlib.sha256(content).hexdigest()!=part['sha256']:raise ValueError('Artifact chunk hash mismatch')
                dest.write(content);local.unlink()
        with archive.open('rb') as handle:
            if hashlib.file_digest(handle,'sha256').hexdigest()!=manifest['sha256']:raise ValueError('Artifact archive hash mismatch')
        with zipfile.ZipFile(archive) as z:
            for info in z.infolist():
                p=Path(info.filename)
                if p.is_absolute() or '..' in p.parts:raise ValueError('Unsafe result path')
            z.extractall(output/'recovered')
        cli(['download','-s',session,remote+'.log',str(output/'remote.log')])
        cli(['log','-s',session,'-o',str(output/'session.ipynb')])
        events.append({'phase':'before_cleanup','usage':cli(['usage'],quiet=True)})
        if status.get('status')!='complete' or status.get('process_exit')!=0:raise RuntimeError('Remote pilot failed; recovered artifacts are available locally')
    finally:
        if active:
            try:cli(['stop','-s',session],timeout=120)
            finally:events.append({'phase':'after_cleanup','usage':cli(['usage'],quiet=True)})
        events.append({'phase':'finished','seconds':time.monotonic()-started})
        (output/'usage-private.json').write_text(json.dumps(events,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--session',required=True);p.add_argument('--run-id',default='ourrecipes-pilot-001');p.add_argument('--output',required=True)
    p.add_argument('--cli',default='colab');p.add_argument('--auth-provider',choices=['adc','oauth2']);p.add_argument('--steps',type=int,default=200);p.add_argument('--max-seconds',type=int,default=900)
    p.add_argument('--python-version',choices=['3.12','3.13'],default='3.13')
    p.add_argument('--baseline-steps',type=int,default=0)
    p.add_argument('--reuse',action='store_true',help='Take ownership of this already-created dedicated pilot session, including cleanup')
    a=p.parse_args()
    if not re.fullmatch(r'ourrecipes-[a-z0-9-]{1,55}',a.run_id) or not 1<=a.steps<=1000 or not 60<=a.max_seconds<=1200 or not 0<=a.baseline_steps<a.steps:p.error('Invalid bounded pilot settings')
    run(a)

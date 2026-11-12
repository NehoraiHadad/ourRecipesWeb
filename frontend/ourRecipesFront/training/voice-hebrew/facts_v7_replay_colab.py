"""Named T4 owner, private usage logs, streamed warm body, small-output recovery."""
import argparse,hashlib,json,re,signal,subprocess,time,zipfile
from pathlib import Path
from corpus import ROOT,digest
from colab_pilot import upload_warm_weights


def run(args):
 if not re.fullmatch(r'ourrecipes-[a-z0-9-]{1,55}',args.session):raise ValueError('Dedicated session required')
 plan=json.loads((ROOT/'verification/facts-v7-replay-plan-20261112.json').read_text())
 for name,sha in plan['source_sha256'].items():assert digest((ROOT/name).read_bytes())==sha
 with Path(args.warm_weights).open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 assert Path(args.bundle).is_file()
 with zipfile.ZipFile(args.bundle) as z:
  assert z.testzip() is None
  assert json.loads(z.read('verification/facts-v7-replay-plan-20261112.json'))==plan
 output=Path(args.output);output.mkdir(parents=True,exist_ok=False);events=[];active=False;start=time.monotonic();remote='/content/'+args.session
 def cli(argv,timeout=120,quiet=True):
  result=subprocess.run([args.cli,*argv],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
  if not quiet:print(result.stdout+result.stderr,flush=True)
  if result.returncode:raise RuntimeError('Colab '+argv[0]+': '+result.stderr[-1500:]+result.stdout[-500:])
  return result.stdout
 def execute(code):
  result=cli(['ssh','-s',args.session,'-i',args.ssh_identity,'--','python3','-c',code])
  line=next((l.split('=',1)[1] for l in result.splitlines() if l.startswith('FACTS_STATUS=')),None)
  if line is None:raise ValueError('Missing structured SSH response')
  return json.loads(line)
 try:
  events.append({'phase':'before','usage':cli(['usage'])});active=True
  cli(['new','-s',args.session,'--gpu','T4'],180,False)
  args.auth_provider=None;upload_warm_weights(args,args.session,args.ssh_identity)
  material=output/'material.zip'
  import shutil
  shutil.copyfile(args.bundle,material)
  sha=digest(material.read_bytes());cli(['upload','-s',args.session,str(material),'/content/adapter-material.zip']);cli(['upload','-s',args.session,str(ROOT/'facts_v7_replay_job.py'),'/content/adapter-job.py'])
  code=f"import subprocess,sys,json; from pathlib import Path; log=Path({remote!r}+'.log').open('w'); p=subprocess.Popen([sys.executable,'-u','/content/adapter-job.py','--bundle','/content/adapter-material.zip','--output',{remote!r},'--sha256',{sha!r}],stdout=log,stderr=subprocess.STDOUT,start_new_session=True); Path({remote!r}+'.pid').write_text(str(p.pid)); print('FACTS_STATUS='+json.dumps({{'pid':p.pid}}))"
  print(execute(code),flush=True)
  while True:
   if time.monotonic()-start>3300:raise TimeoutError('Overall Colab watchdog')
   code=f"import json; from pathlib import Path; p=Path({remote!r}); s=json.loads((p/'status.json').read_text()) if (p/'status.json').exists() else {{'phase':'starting'}}; s['archive_ready']=Path({remote!r}+'-results.zip.manifest.json').exists(); s['progress']=json.loads((p/'study/progress.json').read_text()) if (p/'study/progress.json').exists() else None; print('FACTS_STATUS='+json.dumps(s))"
   for attempt in range(3):
    try:status=execute(code);break
    except (RuntimeError,subprocess.TimeoutExpired):
     if attempt==2:raise
     time.sleep(3)
   (output/'remote-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status),flush=True)
   if status['archive_ready']:break
   time.sleep(20)
  cli(['download','-s',args.session,remote+'-results.zip.manifest.json',str(output/'archive-manifest.json')]);m=json.loads((output/'archive-manifest.json').read_text());archive=output/'results.zip'
  with archive.open('wb') as dest:
   p=subprocess.run([args.cli,'ssh','-s',args.session,'-i',args.ssh_identity,'--','cat',remote+'-results.zip'],stdin=subprocess.DEVNULL,stdout=dest,stderr=subprocess.PIPE,timeout=120)
  if p.returncode:raise RuntimeError('Result stream failed')
  with archive.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==m['sha256']
  assert archive.stat().st_size==m['bytes']
  with zipfile.ZipFile(archive) as z:
   assert z.testzip() is None and all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist());z.extractall(output/'recovered')
  cli(['download','-s',args.session,remote+'.log',str(output/'remote.log')]);events.append({'phase':'before_cleanup','usage':cli(['usage'])})
  if status['status']!='complete':raise RuntimeError('Remote job failed; artifacts recovered: '+str(status))
 finally:
  if active:
   try:cli(['stop','-s',args.session],120,False)
   finally:events.append({'phase':'after_cleanup','usage':cli(['usage'])})
  events.append({'phase':'finished','seconds':time.monotonic()-start});(output/'usage-private.json').write_text(json.dumps(events,indent=2)+'\n')


if __name__=='__main__':
 def term(signum,frame):raise SystemExit('Interrupted; releasing dedicated runtime')
 signal.signal(signal.SIGTERM,term)
 p=argparse.ArgumentParser();p.add_argument('--session',required=True);p.add_argument('--output',required=True);p.add_argument('--bundle',required=True);p.add_argument('--warm-weights',required=True);p.add_argument('--ssh-identity',required=True);p.add_argument('--cli',default='colab');a=p.parse_args();run(a)

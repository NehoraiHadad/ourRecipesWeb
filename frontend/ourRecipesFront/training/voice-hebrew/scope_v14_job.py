"""Dedicated remote adapter job. Recover only small outputs, never a full body."""
import argparse,hashlib,json,os,shutil,subprocess,sys,time,zipfile
from pathlib import Path


def run(bundle,output,sha):
 start=time.monotonic();output=Path(output);output.mkdir(exist_ok=False);material=output/'material';material.mkdir()
 state={'status':'running','phase':'verify'}
 def update(phase,**kw):
  state.update(phase=phase,seconds=time.monotonic()-start,**kw);(output/'status.json').write_text(json.dumps(state)+'\n');print(json.dumps(state),flush=True)
 def call(argv,phase,timeout):
  update(phase);subprocess.run(argv,cwd=material,check=True,timeout=timeout,env={**os.environ,'PYTHONUNBUFFERED':'1','HF_HUB_DISABLE_TELEMETRY':'1','TOKENIZERS_PARALLELISM':'false'})
 try:
  with Path(bundle).open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==sha
  with zipfile.ZipFile(bundle) as z:
   assert sum(i.file_size for i in z.infolist())<128*1024*1024
   assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist());z.extractall(material)
  plan=json.loads((material/'verification/scope-v14-stance-plan-20261112.json').read_text())
  warm=Path('/content/ourrecipes-warm-weights.safetensors')
  with warm.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
  shutil.copyfile(warm,material/'warm-start/model.safetensors')
  (output/'hardware.json').write_text(json.dumps({'gpu':subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.total,driver_version','--format=csv,noheader'],text=True).strip()}))
  uv=shutil.which('uv')
  if not uv:call([sys.executable,'-m','pip','install','uv==0.9.5'],'install_uv',90);uv=shutil.which('uv')
  call([uv,'venv','--python','3.13','--seed',str(output/'venv')],'python313',180)
  python=str(output/'venv/bin/python')
  call([python,'-m','pip','install','torch==2.6.0','--index-url','https://download.pytorch.org/whl/cu124'],'torch',360)
  call([python,'-m','pip','install','transformers==4.48.3','huggingface-hub==0.28.1','tokenizers==0.21.0','safetensors==0.5.2','numpy==2.2.6'],'dependencies',180)
  args=['--base',str(material/'warm-start')]
  call([python,str(material/'scope_v14_stance.py'),str(output/'mechanics'),*args,'--max-seconds','120','--mechanics-only'],'gpu_mechanics',180)
  mechanics=json.loads((output/'mechanics/result.json').read_text())
  assert mechanics['mechanics_only'] and len(mechanics['trials'])==1 and all(t['actual_updates']==2 for t in mechanics['trials'])
  assert all(t['body_unchanged_when_disabled'] and t['peak_gpu_allocated_bytes']<10*1024**3 for t in mechanics['trials'])
  call([python,str(material/'scope_v14_stance.py'),str(output/'study'),*args,'--max-seconds','1800'],'quality_study',1890)
  update('complete',status='complete')
 except BaseException as error:
  update('failed',status='failed',error=str(error),error_type=type(error).__name__);raise
 finally:
  archive=Path(str(output)+'-results.zip')
  with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
   for name in ('status.json','hardware.json'):
    if (output/name).exists():z.write(output/name,name)
   for directory in ('mechanics','study'):
    for p in (output/directory).rglob('*'):
     if p.is_file() and not (directory=='mechanics' and p.suffix=='.safetensors'):z.write(p,p.relative_to(output))
  with archive.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
  Path(str(archive)+'.manifest.json').write_text(json.dumps({'bytes':archive.stat().st_size,'sha256':h})+'\n')
  print('ARCHIVE_READY',str(archive),flush=True)


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--bundle',required=True);p.add_argument('--output',required=True);p.add_argument('--sha256',required=True);a=p.parse_args();run(a.bundle,a.output,a.sha256)

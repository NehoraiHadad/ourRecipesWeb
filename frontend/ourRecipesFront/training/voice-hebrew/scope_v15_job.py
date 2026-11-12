"""Isolated native LLM baseline; recover JSON evidence, never its3.44GB weights."""
import argparse,hashlib,json,os,shutil,subprocess,sys,time,zipfile
from pathlib import Path


def run(bundle,output,sha):
 output=Path(output);output.mkdir(exist_ok=False);material=output/'material';material.mkdir();start=time.monotonic()
 def update(phase,**fields):
  state={'status':'running','phase':phase,'seconds':time.monotonic()-start,**fields};(output/'status.json').write_text(json.dumps(state)+'\n');print(json.dumps(state),flush=True)
 def call(args,phase,timeout):
  update(phase);subprocess.run(args,cwd=material,check=True,timeout=timeout,env={**os.environ,'HF_HUB_DISABLE_TELEMETRY':'1','TOKENIZERS_PARALLELISM':'false','PYTHONUNBUFFERED':'1'})
 try:
  with Path(bundle).open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==sha
  with zipfile.ZipFile(bundle) as z:
   assert z.testzip() is None and all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist());assert sum(i.file_size for i in z.infolist())<16*1024**2;z.extractall(material)
  (output/'hardware.json').write_text(json.dumps({'gpu':subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.total,driver_version','--format=csv,noheader'],text=True).strip()}))
  uv=shutil.which('uv')
  if not uv:call([sys.executable,'-m','pip','install','uv==0.9.5'],'install_uv',90);uv=shutil.which('uv')
  call([uv,'venv','--python','3.13','--seed',str(output/'venv')],'python313',180);python=str(output/'venv/bin/python')
  call([python,'-m','pip','install','torch==2.6.0','--index-url','https://download.pytorch.org/whl/cu124'],'torch',360)
  call([python,'-m','pip','install','transformers==4.57.1','huggingface-hub==0.36.0','tokenizers==0.22.1','safetensors==0.6.2','numpy==2.2.6'],'dependencies',180)
  call([python,str(material/'scope_v15_teacher.py'),str(output/'study')],'native_capacity',1800)
  update('complete',status='complete')
 except BaseException as error:
  update('failed',status='failed',error=str(error),error_type=type(error).__name__);raise
 finally:
  archive=Path(str(output)+'-results.zip')
  with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
   for n in ('status.json','hardware.json'):
    if (output/n).exists():z.write(output/n,n)
   for p in (output/'study').rglob('*.json'):z.write(p,p.relative_to(output))
  with archive.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  Path(str(archive)+'.manifest.json').write_text(json.dumps({'sha256':sha,'bytes':archive.stat().st_size})+'\n')


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--bundle',required=True);p.add_argument('--output',required=True);p.add_argument('--sha256',required=True);a=p.parse_args();run(a.bundle,a.output,a.sha256)

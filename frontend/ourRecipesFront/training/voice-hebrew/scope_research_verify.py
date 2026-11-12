"""Read-only provenance checks for the scope research packet, no test inference."""
import hashlib,json,re,subprocess,zipfile
from pathlib import Path
from corpus import ROOT,digest


def run():
 plans=['scope-v8-plan','scope-v8-factor-plan','scope-v9-plan','scope-v9-guarded-plan','scope-v10-consensus-plan','scope-v10-prospective-plan','scope-v11-replay-plan']
 sources=[]
 for name in plans:
  p=ROOT/'verification'/f'{name}-20261112.json'
  plan=json.loads(p.read_text());errors=[n for n,s in plan['source_sha256'].items() if digest((ROOT/n).read_bytes())!=s]
  if errors:raise ValueError(f'{name} source drift: {errors}')
  sources.append({'plan':str(p.relative_to(ROOT)),'files':len(plan['source_sha256']),'all_equal':True})
 archives=[]
 for folder in ('colab-scope-v8','colab-scope-v8-factor','colab-scope-v9','colab-scope-v9-guarded','colab-scope-v10-consensus','colab-scope-v11-replay'):
  root=ROOT/'runs'/folder
  if not (root/'archive-manifest.json').exists():continue
  manifest=json.loads((root/'archive-manifest.json').read_text());archive=root/'results.zip'
  with archive.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  assert sha==manifest['sha256'] and archive.stat().st_size==manifest['bytes']
  with zipfile.ZipFile(archive) as z:assert z.testzip() is None
  m=json.loads((root/'recovered/mechanics/result.json').read_text());n=len(m['trials'])
  if folder not in ('colab-scope-v8','colab-scope-v8-factor'):
   assert n==1 and m['trials'][0]['actual_steps']==2
  archives.append({'folder':folder,'sha256':sha,'bytes':archive.stat().st_size,'crc':True,'dedicated_gpu_mechanics_trials':n,'empty_legacy_smoke_not_quality_evidence':n==0})
 body=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run/model/model.safetensors'
 with body.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 assert sha=='f053074f0118ebdd8157906ef862001135c6b9d6b3e15810e5aca25f6dc30bb4'
 changes=subprocess.check_output(['git','-C',str(ROOT.parents[3]),'status','--porcelain','--untracked-files=normal'],text=True).splitlines()
 outside=[line for line in changes if not line[3:].startswith('frontend/ourRecipesFront/training/voice-hebrew/')]
 if outside:raise ValueError('Outside-scope changes require separate review: '+str(outside))
 log=Path('/tmp/ourrecipes-voice-full-tests.log').read_text();count=int(re.search(r'Ran (\d+) tests',log).group(1));assert log.rstrip().endswith('OK')
 proof={'frozen_sources':sources,'archives':archives,'original_body_sha256':sha,'body_bytes':body.stat().st_size,'tests':{'command':'/tmp/ourrecipes-voice-py313/bin/python -m unittest discover -s tests -v','passed':count,'log_sha256':digest(log.encode()),'mocked_cli_controls_are_not_quality_evidence':True},'new_test_inference_by_verifier':False,'physical_device_tested':False,'human_reviewed':False,'outside_training_changes':outside,'metadata_errata':'Old guarded steps metadata stale; actual frozen V9 source/curves min4000/max8000. Old V8/V8b dedicated GPU smoke empty and preserved; actual quality trials ran.'}
 (ROOT/'verification/scope-research-verification-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof


if __name__=='__main__':run()

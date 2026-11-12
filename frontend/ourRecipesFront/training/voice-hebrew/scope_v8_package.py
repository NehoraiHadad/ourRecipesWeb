"""Frozen research replay packet: no full bodies, private usage or credentials."""
import argparse,hashlib,json,zipfile
from pathlib import Path
from corpus import ROOT,digest

def pack(root,output):
 root=Path(root);study=root/'recovered/study';result=json.loads((study/'result.json').read_text());plan=json.loads((study/'plan.json').read_text());extra={}
 for n in ('SCOPE_V8_PLAN.he.md','SCOPE_V8_RESULTS.he.md','scope_v8_test.py','scope_v8_summary.py','scope_v8_package.py','scope_v8_errors.py','tests/test_scope_v8.py','README.he.md','TRAINING_RESULTS.he.md','VERIFICATION.md',
 'verification/scope-v8-results-20261112.json','verification/scope-v8-verification-20261112.json','verification/scope-v8-tokenization-20261112.json'):
  if (ROOT/n).exists():extra[n]=(ROOT/n).read_bytes()
 for n in ('verification/scope-v8-test-20261112.json','verification/scope-v8-errors-20261112.json'):
  if (ROOT/n).exists():extra[n]=(ROOT/n).read_bytes()
 for t in result['trials']:
  name=f"{t['arm']}-{t['seed']}"
  for n in ('best.pt','last.pt','curve.jsonl','result.json','native.json'):extra['scope-v8-artifact/'+name+'/'+n]=(study/name/n).read_bytes()
 for n in ('plan.json','result.json'):extra['scope-v8-artifact/'+n]=(study/n).read_bytes()
 for p in (ROOT/'dist/scope-v8-learning-curves-20261112').glob('*'):
  if p.is_file():extra[str(p.relative_to(ROOT))]=p.read_bytes()
 test=json.loads((ROOT/'verification/scope-v8-test-20261112.json').read_text()) if (ROOT/'verification/scope-v8-test-20261112.json').exists() else None
 artifact={'status':'Research; see results and separate test proof. No voice/app integration approval.','body_sha256':plan['body_sha256'],'body_bytes':735066976,'full_body_included':False,'body_requirement':'Exact adapted f053 body at warm-start/model.safetensors; public original DictaBERT is not byte-equivalent.',
 'selected_method':result['selected_method'],'qualified_for_test':result['qualified_for_test'],'test_sets_opened':list(test['test_sets']) if test else [],'original120_and_v5_fresh480_inferred':False,'physical_device_tested':False,'human_reviewed':False,
 'best_contains_head_and_adapters':True,'last_contains_optimizer_and_rng':True,'exact_resume_tested_for_v8':False,'license':'Original DictaBERT CC-BY-4.0 attribution retained; see RESEARCH_MODEL_ATTRIBUTION.txt'}
 extra['scope-v8-artifact/artifact.json']=(json.dumps(artifact,indent=2)+'\n').encode()
 with zipfile.ZipFile(root/'material.zip') as src,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for n in src.namelist():
   if n=='packet-sha256.json' or n in extra:continue
   z.writestr(n,src.read(n))
  for n,v in extra.items():z.writestr(n,v)
  for n,s in plan['source_sha256'].items():assert digest(z.read(n))==s,n
  assert digest(z.read('verification/scope-v8-data-20261112.json'))==plan['data_sha256']
  hashes={n:digest(z.read(n)) for n in z.namelist()};z.writestr('packet-sha256.json',json.dumps(hashes,indent=2)+'\n');assert z.testzip() is None
 output=Path(output)
 with output.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 proof={'path':str(output.resolve()),'bytes':output.stat().st_size,'sha256':sha,'members':len(hashes)+1,'all_frozen_training_sources_and_data_verified':True,'crc_verified':True,'full_body_included':False,'test_sets_opened':artifact['test_sets_opened'],'credentials_private_logs_audio_app_data_included':False}
 (ROOT/'verification/scope-v8-package-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('output');a=p.parse_args();pack(a.root,a.output)

"""Allowlisted source/data/small-weight packet. No bodies or private run logs."""
import hashlib,json,zipfile
from pathlib import Path
from corpus import ROOT,digest


def pack():
 newroot=ROOT/'runs/colab-scope-v11-replay'
 assert (newroot/'recovered/study/result.json').is_file(),'Recover the final run first'
 extra={}
 def add(p):
  p=Path(p)
  if p.is_file():extra[str(p.relative_to(ROOT))]=p.read_bytes()
 docs=['README.he.md','TRAINING_RESULTS.he.md','VERIFICATION.md','SCOPE_V8_RESULTS.he.md','SCOPE_V9_RESULTS.he.md','SCOPE_RESEARCH_HANDOFF.he.md','RESEARCH_NEXT.he.md','RESEARCH_MODEL_ATTRIBUTION.txt']
 helpers=['scope_v8_summary.py','scope_v8_errors.py','scope_v8_package.py','scope_v9_summary.py','scope_v9_errors.py','scope_v9_benchmark.py','scope_v10_benchmark.py','scope_v11_summary.py','scope_v11_diagnostic.py','scope_v12_evidence.py','scope_v12_test.py','scope_v12_benchmark.py','reference_evidence.py','tests/test_reference_evidence.py','tests/test_scope_v12_evidence.py','scope_consensus_summary.py','scope_research_package.py','scope_research_verify.py','scope_routing_coverage.py','evidence_guard.py','evidence_guard_evaluate.py','tests/test_evidence_guard.py']
 for n in docs+helpers:add(ROOT/n)
 for n in ('facts_v7_test.py','scope_v8_test.py','scope_v8_factor_test.py','scope_v9_test.py','scope_v9_guarded_test.py'):add(ROOT/n)
 for p in (ROOT/'tests').glob('*.py'):add(p)
 for pattern in ('scope-v8*-20261112.json','scope-v9*-20261112.json','scope-v10*-20261112.json','scope-v11*-20261112.json','scope-v12*-20261112.json','scope-routing-*-20261112.json','scope-reference-*-20261112.json','scope-consensus-*-20261112.json','evidence-guard*-20261112.json','scope-research-verification-20261112.json','scope-research-cleanup-20261112.json'):
  for p in (ROOT/'verification').glob(pattern):add(p)
 allowed={'plan.json','result.json','curve.jsonl','native.json','hardware.json','best.pt','semantic-best.pt','safety-best.pt','model.pt','scope-v8.json','retained-v7.json'}
 for name in ('colab-scope-v8','colab-scope-v8-factor','colab-scope-v9','colab-scope-v9-guarded','colab-scope-v10-consensus','colab-scope-v11-replay'):
  root=ROOT/'runs'/name
  for folder in ('recovered','consensus-development','fresh-test-once'):
   for p in (root/folder).rglob('*'):
    if p.is_file() and (p.name in allowed or (p.suffix=='.json' and p.name.startswith(('scope-v8-','retained-v7-')))):add(p)
 for folder in ('scope-v8-learning-curves-20261112','scope-v8-factor-learning-curves-20261112','scope-v9-learning-curves-20261112','scope-consensus-learning-curves-20261112','scope-v11-replay-learning-curves-20261112'):
  for p in (ROOT/'dist'/folder).glob('*'):
   if p.suffix in ('.csv','.png','.svg'):add(p)
 for p in (ROOT/'runs/scope-v12-evidence').rglob('*.json'):add(p)
 testpath=ROOT/'verification/scope-v12-evidence-test-20261112.json';test=json.loads(testpath.read_text()) if testpath.exists() else None
 latest=json.loads((newroot/'recovered/study/result.json').read_text())
 v12=json.loads((ROOT/'runs/scope-v12-evidence/result.json').read_text());assert not v12['qualified_for_test'] or test is not None
 metadata={'status':'Model research; failed complete held-test criteria, app/voice/device integration not tested','latest_study':'scope-v12-reference-evidence','body_sha256':'f053074f0118ebdd8157906ef862001135c6b9d6b3e15810e5aca25f6dc30bb4','body_bytes':735066976,'full_body_included':False,'body_requirement':'Exact adapted f053 model.safetensors, copied separately to warm-start/. Public dicta-il/dictabert is not equivalent. See handoff.','v11_three_seed_qualified_for_test':latest['qualified_for_test'],'v12_development_qualified':v12['qualified_for_test'],'test_sets_opened':list(test['test_sets']) if test else [],'all_opened_tests_passed':test['all_opened_tests_passed'] if test else None,'opened_tests_now_regression_only':True,'independent_quality_repetitions':False,'original120_v5fresh480_inferred':False,'physical_device_tested':False,'human_reviewed':False,'best_weights_included':True,'optimizer_last_checkpoints_included':False,'last_checkpoints_preserved_locally':True,'license':'Derived DictaBERT attribution retained; RESEARCH_MODEL_ATTRIBUTION.txt','private_account_auth_usage_logs_audio_app_data_included':False}
 extra['scope-research-artifact.json']=(json.dumps(metadata,indent=2)+'\n').encode()
 output=ROOT/'dist/ourRecipes-hebrew-model-research-scope-20261112.zip'
 with zipfile.ZipFile(newroot/'material.zip') as src,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for n in src.namelist():
   if n!='packet-sha256.json' and n not in extra:z.writestr(n,src.read(n))
  for n,b in extra.items():z.writestr(n,b)
  plan=json.loads(z.read('verification/scope-v12-evidence-plan-20261112.json'))
  for n,h in plan['source_sha256'].items():assert digest(z.read(n))==h,n
  assert digest(z.read('verification/scope-v9-data-20261112.json'))==plan['data_sha256']
  assert not any(n.endswith('.safetensors') or any(t in n.lower() for t in ('usage-private','remote.log','credentials','ssh-voice-pilot','application_default_credentials')) for n in z.namelist())
  hashes={n:digest(z.read(n)) for n in z.namelist()};z.writestr('packet-sha256.json',json.dumps(hashes,indent=2)+'\n');assert z.testzip() is None
 with output.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 proof={'path':str(output),'bytes':output.stat().st_size,'sha256':sha,'members':len(hashes)+1,'crc_verified':True,'frozen_sources_verified':True,'full_body_included':False,'test_sets_opened':metadata['test_sets_opened'],'private_account_auth_usage_logs_audio_app_data_included':False}
 (ROOT/'verification/scope-research-package-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof


if __name__=='__main__':pack()

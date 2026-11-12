"""Reproducible research packet; full encoder bodies stay outside small packet."""
import argparse,hashlib,json,zipfile
from pathlib import Path
from corpus import ROOT,digest


def pack(root,output):
 root=Path(root);study=root/'recovered/study';result=json.loads((study/'result.json').read_text());plan=json.loads((study/'plan.json').read_text());extra={}
 names=['facts_v7_evaluate.py','facts_v7_summary.py','facts_v7_package.py','FACTS_V7_PLAN.he.md','FACTS_V7_RESULTS.he.md','README.he.md','TRAINING_RESULTS.he.md','VERIFICATION.md',
 'verification/facts-v7-results-20261112.json','verification/facts-v7-native-20261112.json','verification/facts-v7-data-audit-20261112.json','tests/test_facts_v7.py']
 for n in names:extra[n]=(ROOT/n).read_bytes()
 names2=['facts_v7_replay_summary.py','facts_v7_replay.py','facts_v7_replay_job.py','facts_v7_replay_colab.py','facts_v7_test.py','facts_v7_errors.py','research_metric_audit.py','verification/facts-v7-replay-plan-20261112.json','verification/facts-v7-replay-data-20261112.json','verification/facts-v7-replay-results-20261112.json','verification/facts-v7-replay-errors-20261112.json','verification/facts-v7-verification-20261112.json','tests/test_facts_v7_replay.py']
 for n in names2:extra[n]=(ROOT/n).read_bytes()
 replay=root.parent/'colab-facts-v7-replay/recovered/study';replay_result=json.loads((replay/'result.json').read_text());replay_plan=json.loads((replay/'plan.json').read_text())
 for trial in replay_result['trials']:
  directory='flat-narrow-'+str(trial['seed'])
  for n in ('best.pt','last.pt','curve.jsonl','result.json','native.json'):
   extra['facts-v7-replay-artifact/'+directory+'/'+n]=(replay/directory/n).read_bytes()
 for n in ('plan.json','result.json'):extra['facts-v7-replay-artifact/'+n]=(replay/n).read_bytes()
 for p in (ROOT/'dist/facts-v7-replay-learning-curves-20261112').glob('*'):
  if p.is_file():extra[str(p.relative_to(ROOT))]=p.read_bytes()
 full=[]
 for trial in result['trials']:
  name=f"{trial['arm']}-42";folder=study/name
  for n in ('best.pt','last.pt','curve.jsonl','result.json'):
   if (folder/n).exists():extra['facts-v7-artifact/'+name+'/'+n]=(folder/n).read_bytes()
  body=folder/'best-body.safetensors'
  if body.exists():
   with body.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
   full.append({'arm':trial['arm'],'bytes':body.stat().st_size,'sha256':sha,'relative_path_in_recovered_results':str(body.relative_to(root))})
 for n in ('plan.json','result.json'):extra['facts-v7-artifact/'+n]=(study/n).read_bytes()
 for n in ('curves.csv','learning-curves.png','learning-curves.svg','calibration-failures.json','calibration-by-group.json'):
  relative='dist/facts-v7-learning-curves-20261112/'+n;extra[relative]=(ROOT/relative).read_bytes()
 info={'status':'Pilot only; see results for gates/transfer. Not approved for app integration.','full_bodies_in_packet':False,'full_finetune_best_available_in_local_recovered_archive':full,
 'required_original_body_sha256':plan['body_sha256'],'original_body_bytes':735066976,'original_body_path':'warm-start/model.safetensors','body_source':'Exact adapted V12 f053 checkpoint; public original DictaBERT is not byte-equivalent.',
 'test_inference':False,'mechanics_vs_quality':'GPU mechanics outputs excluded; real quality best/last and curves included. Tiny tests are mechanics only.',
 'replay_qualified_for_fresh_test':replay_result['qualified_for_test'],'replay_new_test_inference':replay_result['new_test_inference'],'full_last_optimizer_saved':False,'adapter_last_contains_optimizer_rng':True,'exact_resume_tested_v7':False,'full_encoder_fallback':'Needs separate original f053 body. Fine-tuned body cannot be disabled like LoRA.',
 'human_reviewed':False,'physical_device_tested':False,'license':'DictaBERT CC-BY-4.0 attribution retained; see RESEARCH_MODEL_ATTRIBUTION.txt'}
 extra['facts-v7-artifact/artifact.json']=(json.dumps(info,indent=2)+'\n').encode()
 with zipfile.ZipFile(root/'material.zip') as src,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for n in src.namelist():
   if n=='packet-sha256.json' or n in extra:continue
   z.writestr(n,src.read(n))
  for n,value in extra.items():z.writestr(n,value)
  for n,sha in plan['source_sha256'].items():assert digest(z.read(n))==sha,n
  assert digest(z.read('verification/facts-v7-data-20261112.json'))==plan['data_sha256']
  for n,sha in replay_plan['source_sha256'].items():assert digest(z.read(n))==sha,n
  assert digest(z.read('verification/facts-v7-replay-data-20261112.json'))==replay_plan['data_sha256']
  hashes={n:digest(z.read(n)) for n in z.namelist()};z.writestr('packet-sha256.json',json.dumps(hashes,indent=2)+'\n');assert z.testzip() is None
 output=Path(output)
 with output.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 proof={'path':str(output.resolve()),'bytes':output.stat().st_size,'sha256':sha,'members':len(hashes)+1,'frozen_sources_and_data_verified':True,'crc_verified':True,
 'full_bodies_included':False,'credentials_private_logs_audio_app_data_included':False,'test_inference':False}
 (ROOT/'verification/facts-v7-package-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('output');a=p.parse_args();pack(a.root,a.output)

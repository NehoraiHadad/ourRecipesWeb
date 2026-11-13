"""Read-only provenance and metrics for real tiny-model browser development runs."""
import hashlib,json,math,statistics,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def sha(path):
 with Path(path).open('rb') as file:return hashlib.file_digest(file,'sha256').hexdigest()

def distribution(values):
 values=sorted(v for v in values if v is not None)
 return {'n':len(values),'median_ms':statistics.median(values),'p95_nearest_rank_ms':values[math.ceil(.95*len(values))-1],'min_ms':min(values),'max_ms':max(values)}

def summarize():
 proofs={};files={}
 for protocol,plan_name in [('tiny-recipe-browser','tiny-recipe-browser-plan-20261113.json'),('tiny-recipe-controls','tiny-recipe-control-plan-20261113.json')]:
  plan=json.loads((ROOT/'verification'/plan_name).read_text())
  for name,expected in plan['source_sha256'].items():assert sha(ROOT/name)==expected,name
  runtime=ROOT/'../../public/voice/runtime/llm'
  for name,expected in plan['runtime_sha256'].items():assert sha(runtime/name)==expected
  for name in ('qwen35-08','qwen3-06'):
   path=ROOT/'runs'/protocol/name/'result.json';result=json.loads(path.read_text());files[str(path.relative_to(ROOT))]=sha(path)
   assert result['completed'] and result['dedicatedBrowserClosed'] and not result['browserExternalRequests'] and not result['applicationStateCommitted']
   assert result['modelIntegrity']['status']=='verified' and result['modelIntegrity']['sha256']==plan['models'][name]['sha256']
   assert len(result['cases'])==(20 if protocol=='tiny-recipe-browser' else 4)
   entry={'result_sha256':sha(path),'model_sha256':result['modelIntegrity']['sha256'],'load_ms':result['load']['ms'],'load_source':result['modelIntegrity']['source'],'loaded_context':result['load']['loadedContext'],'template_sha256':result['load']['templateSha256'],'seconds':result['seconds'],'browser':result['browser'],'memory':{'peak_chromium_process_rss_sum_mib':result['memory']['peakChromiumProcessSumMiB'],'scope':result['memory']['scope']},'arms':{}}
   for mode in sorted({c['mode'] for c in result['cases']}):
    rows=[c for c in result['cases'] if c['mode']==mode];arm={'rows':len(rows),'completion_latency':distribution([c['ms'] for c in rows]),'first_content_latency':distribution([c['firstTokenMs'] for c in rows]),'length_truncated':sum(c['finishReason']=='length' for c in rows)}
    if mode=='structured':
     valid=[c for c in rows if c['evaluation']['structurallyValid']];changing=[c for c in rows if c['expectedUpdates']];readonly=[c for c in rows if not c['expectedUpdates']]
     arm.update(structurally_valid=len(valid),exact_reported_fact_lists=sum(c['evaluation'].get('exactReportedFacts',False) for c in rows),correct_final_states=sum(c['evaluation'].get('expectedFinalState',False) for c in rows),required_change_cases=len(changing),correct_required_change_final_states=sum(c['evaluation'].get('expectedFinalState',False) for c in changing),readonly_cases=len(readonly),correct_readonly_final_states=sum(c['evaluation'].get('expectedFinalState',False) for c in readonly),scoring_limits='Final-state matches include existing no-op states and do not imply a correct reply. Exact fact-list scoring penalizes extra no-op entries;both are reported. Structural validity is not semantics. No real app state committed.')
    entry['arms'][mode]=arm
   proofs[protocol+'/'+name]=entry
 old=ROOT/'../../docs/voice-evidence/qwen35-small-hebrew.json';old_result=json.loads(old.read_text())
 parents={n:sha(ROOT/'dist'/n) for n in ['ourRecipes-hebrew-model-research-scope-20261112.zip','ourRecipes-hebrew-stance-continuation-20261112.zip','ourRecipes-hebrew-capacity-diagnosis-20261112.zip']}
 assert list(parents.values())==['b93fdbefa8ca53b6fd21fc44db39689046cb9df4bbc72e365f336d61ee989add','e193c37bd7f092c02a766f5e2a2a983595e43e4c0f5691f7a5d297eec4412ea6','15469009c3efdbc5f3dd116eef1c3b19f18ab302fedf1b2633150b62a1594857']
 proof={'studies':proofs,'raw_result_sha256':files,'prior_browser_evidence':{'file':str(old.relative_to(ROOT)),'sha256':sha(old),'observed_date':old_result['date'],'environment':old_result['environment'],'note':'Earlier Nov13 statements implying no prior browser inference were inaccurate;Nov10 cloud Chromium evidence existed. No physical phone evidence found.'},'prior_packets_unchanged':parents,'inference_runs':4,'total_generated_outputs':48,'human_reviewed':False,'recorded_speech':False,'physical_device_tested':False,'training_performed':False,'held_tests_inferred':False,'application_state_committed':False,'runtime_limit':'CPU WASM,WebGPU capability probe only reports SwiftShader software. No real GPU/mobile performance claim.','experiment_limit':'Authored development10cases+4controls,not independent quality test. New prompt/schema/context/template differ together from old pilot;no single-factor causal claim.'}
 (ROOT/'verification/tiny-recipe-browser-results-20261113.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');return proof

def package():
 proof=json.loads((ROOT/'verification/tiny-recipe-browser-results-20261113.json').read_text());files={}
 for pattern in ('tiny_recipe*.mjs','tiny_recipe*.py','verification/tiny-recipe*.json','verification/tiny-recipe*.txt'):
  for path in ROOT.glob(pattern):
   if path.name!='tiny-recipe-browser-package-20261113.json':files[str(path.relative_to(ROOT))]=path.read_bytes()
 for name in ('TINY_BROWSER_RECIPE_RESULTS.he.md','RESEARCH_LOG.he.md'):files[name]=(ROOT/name).read_bytes()
 for folder in ('tiny-recipe-browser','tiny-recipe-controls'):
  for path in (ROOT/'runs'/folder).rglob('*'):
   if path.is_file() and path.suffix in ('.json','.jsonl'):files[str(path.relative_to(ROOT))]=path.read_bytes()
 meta={'model_weights_included':False,'runtime_binaries_included':False,'requires':'Existing frontend dependencies Wllama3.13.0 and Playwright/Chromium;runtime paths in frozen plans. Pinned public GGUF weights with SHA,synthetic fixtures and raw outputs recorded. No private credentials/account/audio files.','scope':'Local browser development probes,not a production assistant,phone benchmark,or fine-tuned model.','parent_research_packets_unchanged':proof['prior_packets_unchanged']};files['tiny-browser-packet.json']=(json.dumps(meta,indent=2)+'\n').encode()
 target=ROOT/'dist/ourRecipes-tiny-browser-recipe-20261113.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
  for name,data in files.items():z.writestr(name,data)
  z.writestr('packet-sha256.json',json.dumps({n:hashlib.sha256(v).hexdigest() for n,v in files.items()},indent=2)+'\n')
 with zipfile.ZipFile(target) as z:
  assert z.testzip() is None
  for name,expected in json.loads(z.read('packet-sha256.json')).items():assert hashlib.sha256(z.read(name)).hexdigest()==expected
 result={'file':str(target),'bytes':target.stat().st_size,'sha256':sha(target),'members':len(files)+1,'crc_and_member_sha_verified':True,'weights_and_credentials_included':False};(ROOT/'verification/tiny-recipe-browser-package-20261113.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));return result

def verify_archive():
 import subprocess,tempfile
 target=ROOT/'dist/ourRecipes-tiny-browser-recipe-20261113.zip'
 with tempfile.TemporaryDirectory(prefix='tiny-recipe-packet-') as temp:
  with zipfile.ZipFile(target) as z:
   assert z.testzip() is None
   manifest=json.loads(z.read('packet-sha256.json'));assert len(manifest)+1==len(z.namelist())
   for name,expected in manifest.items():assert hashlib.sha256(z.read(name)).hexdigest()==expected
   for name in z.namelist():assert not Path(name).is_absolute() and '..' not in Path(name).parts
   z.extractall(temp)
  result=subprocess.run(['node','--test','tiny_recipe_cases.test.mjs'],cwd=temp,capture_output=True,text=True)
  (ROOT/'verification/browser-tiny-packet-tests-20261113.txt').write_text(result.stdout+result.stderr)
  assert result.returncode==0
  proof={'packet_sha256':sha(target),'members_sha256_verified':len(manifest),'crc_verified':True,'archive_node_unit_tests_passed':4,'node_exit_code':result.returncode,'new_model_inference_by_this_check':False}
  (ROOT/'verification/browser-tiny-packet-check-20261113.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));return proof

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--package',action='store_true');p.add_argument('--verify-archive',action='store_true');a=p.parse_args()
 if a.verify_archive:verify_archive()
 elif a.package:package()
 else:print(json.dumps(summarize(),ensure_ascii=False,indent=2))

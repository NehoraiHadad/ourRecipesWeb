"""Read-only summaries, provenance checks and archive of the stance continuation."""
import datetime,hashlib,json,subprocess,zipfile
from pathlib import Path
from corpus import ROOT,digest
V13=ROOT/'runs/scope-v13-stance'
V14=ROOT/'runs/colab-scope-v14-stance'

def teacher(number):
 folder=ROOT/f'runs/colab-scope-v{number}-teacher';plan=json.loads((ROOT/f'verification/scope-v{number}-teacher-plan-20261112.json').read_text())
 for n,h in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==h,n
 assert digest((ROOT/'verification/scope-v13-stance-data-20261112.json').read_bytes())==plan['data_sha256']
 manifest=json.loads((folder/'archive-manifest.json').read_text())
 with (folder/'results.zip').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==manifest['sha256']
 with zipfile.ZipFile(folder/'results.zip') as z:assert z.testzip() is None
 result=json.loads((folder/'recovered/study/result.json').read_text())
 assert result['weight_sha256']==plan['weight_sha256'] and not result['training_performed']
 assert json.loads((folder/'recovered/status.json').read_text())['status']=='complete'
 data=json.loads((ROOT/'verification/scope-v13-stance-data-20261112.json').read_text())['splits'];analysis={}
 for split,file in (('dev','dev-raw.json'),('calibration','calibration-raw.json')):
  raw=json.loads((folder/'recovered/study'/file).read_text());indexed={r['id']:r for r in data[split]};groups={};errors=[];threshold=result['calibration']['threshold']
  for r in raw['records']:
   row=indexed[r['id']];key=row['operator_family'];g=groups.setdefault(key,{'asserted':0,'not_asserted':0,'asserted_allowed':0,'unsafe_allowed':0});allow=r['allow_score']>=threshold;g['asserted' if row['allow'] else 'not_asserted']+=1
   if allow:g['asserted_allowed' if row['allow'] else 'unsafe_allowed']+=1
   if allow!=bool(row['allow']):errors.append({'id':row['id'],'text':row['text'],'expected_asserted':bool(row['allow']),'allow_score':r['allow_score'],'operator_family':key})
  analysis[split]={'groups':groups,'errors_at_calibrated_threshold':errors,'seconds':raw['seconds'],'rows':len(raw['records']),'seconds_per_row_batch_amortized':raw['seconds']/len(raw['records']),'latency_limit':'Includes Python/tokenization and GPU batch4; not isolated-request latency or device benchmark.'}
 cleanup=json.loads((ROOT/'verification/stance-runtime-cleanup-20261112.json').read_text())['sessions'][str(number)]
 assert cleanup['dedicated_stop_command_completed']
 return {'result':result,'archive_verified':manifest,'hardware':json.loads((folder/'recovered/hardware.json').read_text()),'development_error_analysis':analysis,'cleanup':cleanup}


def report():
 p13=json.loads((ROOT/'verification/scope-v13-stance-plan-20261112.json').read_text());p14=json.loads((ROOT/'verification/scope-v14-stance-plan-20261112.json').read_text())
 for plan in (p13,p14):
  for n,h in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==h,n
  assert digest((ROOT/'verification/scope-v13-stance-data-20261112.json').read_bytes())==plan['data_sha256']
 for n,h in p14['input_artifacts'].items():assert digest((ROOT/n).read_bytes())==h,n
 t13=json.loads((V13/'training.json').read_text());reg=json.loads((V13/'regression.json').read_text());r14=json.loads((V14/'recovered/study/result.json').read_text());manifest=json.loads((V14/'archive-manifest.json').read_text())
 with (V14/'results.zip').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==manifest['sha256']
 with zipfile.ZipFile(V14/'results.zip') as z:assert z.testzip() is None
 smoke=json.loads((V14/'recovered/mechanics/result.json').read_text());assert len(smoke['trials'])==1 and smoke['trials'][0]['actual_updates']==2 and smoke['trials'][0]['body_unchanged_when_disabled']
 oldpacket=ROOT/'dist/ourRecipes-hebrew-model-research-scope-20261112.zip'
 with oldpacket.open('rb') as f:parent_sha=hashlib.file_digest(f,'sha256').hexdigest()
 assert parent_sha=='b93fdbefa8ca53b6fd21fc44db39689046cb9df4bbc72e365f336d61ee989add'
 originals={}
 for name,expected in {
  'runs/colab-state-v12/recovered/ablations/control-42/run/model/model.safetensors':p13['body_sha256'],
  'runs/colab-scope-v9-guarded/recovered/study/seed-42/model.pt':'4982f0b35785f51c0494db52c53ba561b62f7bc6e9ed38092544fc84fe34fe8a',
  'runs/colab-scope-v9-guarded/recovered/study/seed-17/model.pt':'ffb407a59425508439c61f74d9304f3c3293a1b31e6493ec2fd4b16b4b0ea597',
  'runs/colab-scope-v10-consensus/recovered/study/seed-73/model.pt':'7781a1b7fa0220d99193f9d7053ae8c0e7b3b3eb90f7701a2eef5046195fe61d'}.items():
  with (ROOT/name).open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
  assert actual==expected,name
  originals[name]=actual
 selected=[]
 for t in t13['trials']:
  selected.append({k:v for k,v in t.items() if k!='calibration_probabilities'})
 fpath=ROOT/'runs/scope-v14-stance-eval/fresh-test-once/result.json';fresh=json.loads(fpath.read_text()) if fpath.exists() else None
 proof={'observed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'v13':{'trials':selected,'selected_arm':reg['selected_arm'],'fresh_test_inferred':(V13/'fresh-test-once').exists(),'feature_preparation':json.loads((V13/'features/manifest.json').read_text())},'v14':r14,'v14_fresh':fresh,'training_hardware':json.loads((V14/'recovered/hardware.json').read_text()),'archive_verified':manifest,'actual_gpu_smoke_updates':2,'parent_packet_unchanged_sha256':parent_sha,'new_tests_inferred':list(fresh['sets']) if fresh else [],'new_tests_uninferred_if_no_fresh':fresh is None,'original120_and_v5fresh480_inferred':False,'human_reviewed':False,'recorded_speech':False,'physical_device_tested':False,'old_v7_training_replay_not_independent_quality':True}
 proof['teachers']={str(n):teacher(n) for n in (15,16)}
 proof['original_models_verified_unchanged']=originals
 testlog=ROOT/'verification/stance-continuation-unit-tests-20261112.txt'
 assert 'Ran 150 tests' in testlog.read_text() and testlog.read_text().rstrip().endswith('OK')
 proof['unit_tests']={'count':150,'passed':True,'log_sha256':digest(testlog.read_bytes()),'scope':'Includes simulated CLI controls and tiny gradient tests, separate from real CPU/T4 quality trials.'}
 proof['new_tests_inferred'] += [f'v{n}:{s}' for n,t in proof['teachers'].items() for s in t['result']['sets']]
 proof['new_tests_uninferred_if_no_fresh']=not bool(proof['new_tests_inferred'])
 (ROOT/'verification/stance-continuation-results-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
 (ROOT/'verification/scope-v13-events-20261112.jsonl').write_bytes((V13/'events.jsonl').read_bytes())
 plot(t13,r14)
 print(json.dumps({'v13_selected':reg['selected_arm'],'v14_qualified':r14['qualified_for_fresh_test'],'fresh_sets':list(fresh['sets']) if fresh else []},ensure_ascii=False));return proof


def plot(t13,r14):
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(1,2,figsize=(12,4));rows=[]
 for t in t13['trials']:
  name=f"v13 {t['arm']} {t['seed']}";points=[json.loads(l) for l in (V13/f"heads/{t['arm']}-{t['seed']}/curve.jsonl").read_text().splitlines()]
  axes[0].plot([p['step'] for p in points],[p['dev_accuracy'] for p in points],label=name);axes[1].plot([p['step'] for p in points],[p['dev_nll'] for p in points],label=name)
 for t in r14['trials']:
  name=f"v14 LoRA {t['seed']}";points=[json.loads(l) for l in (V14/f"recovered/study/seed-{t['seed']}/curve.jsonl").read_text().splitlines()];axes[0].plot([p['step'] for p in points],[p['dev_accuracy'] for p in points],label=name);axes[1].plot([p['step'] for p in points],[p['dev_nll'] for p in points],label=name)
 for ax,title in zip(axes,['Current development accuracy','Current development NLL']):ax.set_title(title);ax.set_xlabel('Updates (batch size differs by study)');ax.grid(alpha=.2);ax.legend(fontsize=7)
 fig.tight_layout();out=ROOT/'dist/stance-continuation-curves-20261112';out.mkdir(exist_ok=True);fig.savefig(out/'curves.png',dpi=160);fig.savefig(out/'curves.svg');plt.close(fig)


def package():
 proof=json.loads((ROOT/'verification/stance-continuation-results-20261112.json').read_text());entries={}
 def add(p):
  p=Path(p)
  assert p.is_file(),p
  entries[str(p.relative_to(ROOT))]=p.read_bytes()
 for n in ('scope_v13_data.py','scope_v13_log.py','scope_v13_features.py','scope_v13_stance.py','scope_v13_train.py','scope_v13_eval.py','scope_v14_stance.py','scope_v14_test.py','scope_v14_colab.py','scope_v14_job.py','stance_study_report.py','RESEARCH_LOG.he.md','STANCE_RESULTS.he.md','README.he.md','SCOPE_RESEARCH_HANDOFF.he.md','tests/test_scope_v13_stance.py','tests/test_scope_v14_stance.py','verification/stance-continuation-unit-tests-20261112.txt'):add(ROOT/n)
 for n in (15,16):
  for filename in (f'scope_v{n}_teacher.py',f'scope_v{n}_job.py',f'scope_v{n}_colab.py',f'tests/test_scope_v{n}_teacher.py'):add(ROOT/filename)
  for p in (ROOT/f'runs/colab-scope-v{n}-teacher/recovered').rglob('*.json'):add(p)
 for name in ('stance_archive_check.py','verification/stance-archive-unit-tests-20261112.txt','verification/stance-archive-first-attempt-20261112.txt'):add(ROOT/name)
 for pattern in ('scope-v13-*-20261112.json','scope-v14-*-20261112.json','scope-v15-*-20261112.json','scope-v16-*-20261112.json','stance-runtime-cleanup-20261112.json','stance-dictalm-template-20261112.json','scope-v13-events-20261112.jsonl','stance-continuation-results-20261112.json'):
  for p in (ROOT/'verification').glob(pattern):add(p)
 for p in V13.rglob('*'):
  if p.suffix in ('.json','.jsonl','.pt'):add(p)
 for folder in (V14/'recovered',ROOT/'runs/scope-v14-stance-eval'):
  for p in folder.rglob('*'):
   if p.suffix in ('.json','.jsonl','.pt'):add(p)
 for p in (ROOT/'dist/stance-continuation-curves-20261112').glob('*'):add(p)
 meta={'kind':'Supplement to frozen original research packet','parent_packet_sha256':proof['parent_packet_unchanged_sha256'],'full_body_included':False,'parent_reference_adapter_weights_included':False,'requires':'Parent research packet168MB plus exact separate735066976B f053 body. New stance heads/adapters,feature caches and logs included. Old model files/results never overwritten.','models_updated':'Only new stance heads and separate stance LoRA; V12 reference encoders remain unchanged.','human_reviewed':False,'recorded_speech':False,'physical_device_tested':False,'new_tests_inferred':proof['new_tests_inferred'],'original120_v5fresh480_inferred':False,'credentials_audio_private_usage_included':False}
 meta.update(teacher_weights_included=False,teacher_reproduction='Public pinned DictaLM checkpoint3.44GB downloaded only on ephemeral authorized GPU. Code,template audit,prompt,data and every classification score included. Original parent packet needed for old imports/tests.')
 entries['stance-supplement.json']=(json.dumps(meta,indent=2)+'\n').encode();output=ROOT/'dist/ourRecipes-hebrew-stance-continuation-20261112.zip'
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for n,b in entries.items():z.writestr(n,b)
  assert not any('usage-private' in n or n.endswith('.safetensors') for n in entries);z.writestr('supplement-sha256.json',json.dumps({n:digest(b) for n,b in entries.items()},indent=2)+'\n');assert z.testzip() is None
 with output.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 result={'path':str(output),'bytes':output.stat().st_size,'sha256':sha,'members':len(entries)+1,'crc_verified':True,'full_body_included':False,'parent_packet_unchanged':True,'credentials_audio_private_usage_included':False};(ROOT/'verification/stance-continuation-package-20261112.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));return result


if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--package',action='store_true');a=p.parse_args();package() if a.package else report()

"""Verify frozen capacity/probe evidence and preserve a new, small research packet."""
import argparse,datetime,hashlib,json,zipfile
from pathlib import Path
from corpus import ROOT,digest
from scope_v17_audit import run as audit


def file_sha(path):
 with Path(path).open('rb') as file:return hashlib.file_digest(file,'sha256').hexdigest()


def report():
 for name in ('scope-v17-capacity','scope-v18-factorial'):
  plan=json.loads((ROOT/f'verification/{name}-plan-20261112.json').read_text())
  for file,expected in {**plan['source_sha256'],**plan.get('input_sha256',{})}.items():assert file_sha(ROOT/file)==expected,file
  data='scope-v13-stance' if 'v17' in name else 'scope-v18-factorial'
  assert file_sha(ROOT/f'verification/{data}-data-20261112.json')==plan['data_sha256']
 folder=ROOT/'runs/colab-scope-v17-capacity';manifest=json.loads((folder/'archive-manifest.json').read_text());assert file_sha(folder/'results.zip')==manifest['sha256']
 with zipfile.ZipFile(folder/'results.zip') as z:assert z.testzip() is None
 result=json.loads((folder/'recovered/study/result.json').read_text());assert result['sets_inferred']==['dev','calibration'] and not result['fresh_test_inferred']
 assert not result['training_performed'] and all(w['verified'] for w in result['weights'])
 assert json.loads((folder/'recovered/status.json').read_text())['status']=='complete'
 cleanup=json.loads((ROOT/'verification/scope-v17-runtime-cleanup-20261112.json').read_text());assert cleanup['dedicated_stop_completed'] and cleanup['termination_receipt_observed']
 parents={}
 for filename,expected in {'ourRecipes-hebrew-model-research-scope-20261112.zip':'b93fdbefa8ca53b6fd21fc44db39689046cb9df4bbc72e365f336d61ee989add','ourRecipes-hebrew-stance-continuation-20261112.zip':'e193c37bd7f092c02a766f5e2a2a983595e43e4c0f5691f7a5d297eec4412ea6'}.items():
  parents[filename]=file_sha(ROOT/'dist'/filename);assert parents[filename]==expected
 probe=json.loads((ROOT/'runs/scope-v18-factorial/result.json').read_text());assert not probe['training_performed'] and not probe['fresh_sets_inferred']
 original_models=json.loads((ROOT/'verification/stance-continuation-results-20261112.json').read_text())['original_models_verified_unchanged']
 for filename,expected in original_models.items():assert file_sha(ROOT/filename)==expected
 log=(ROOT/'verification/scope-v17-unit-tests-20261112.txt').read_text();assert 'Ran 154 tests' in log and log.rstrip().endswith('OK')
 audited=audit();plot(probe)
 proof={'observed_utc':datetime.datetime.now(datetime.UTC).isoformat(),'capacity':result,'factorial_probe':probe,'measurement_audit':'scope-v17-measurement-audit-20261112.json','parents_unchanged':parents,'original_models_verified_unchanged':original_models,'actual_T4_result_archive_verified':manifest,'dedicated_T4_session_terminated':True,'unit_tests':154,'fresh_sets_inferred':False,'human_reviewed':False,'recorded_speech':False,'physical_device_tested':False,'application_files_changed':False,'model_promotion':False}
 (ROOT/'verification/scope-v17-v18-results-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');return proof


def plot(probe):
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(1,2,figsize=(9,4),constrained_layout=True)
 for ax,(name,result) in zip(axes,probe['models'].items()):
  matrix=[[result['cells'][a+' / '+b]['at_half']['classification_accuracy_at_half'] for b in ('training_predicate','calibration_predicate')] for a in ('training_operator','calibration_operator')]
  picture=ax.imshow(matrix,vmin=.5,vmax=1,cmap='YlGn');ax.set_xticks([0,1],['Train predicates','Calibration predicates']);ax.set_yticks([0,1],['Train operators','Calibration operators']);ax.set_title(name)
  for y in range(2):
   for x in range(2):ax.text(x,y,f'{100*matrix[y][x]:.1f}%\n96 examples',ha='center',va='center',color='white' if matrix[y][x]>.9 else 'black')
 fig.colorbar(picture,ax=axes,label='Classification accuracy, fixed cut .5');fig.suptitle('CPU development diagnosis; not held-test or state-update accuracy')
 out=ROOT/'dist/scope-v17-v18-figures-20261112';out.mkdir(exist_ok=True);fig.savefig(out/'factorial.png',dpi=160);fig.savefig(out/'factorial.svg');plt.close(fig)


def package():
 proof=json.loads((ROOT/'verification/scope-v17-v18-results-20261112.json').read_text());files={}
 def add(path):
  path=Path(path);assert path.is_file();files[str(path.relative_to(ROOT))]=path.read_bytes()
 for pattern in ('scope_v17*.py','scope_v18*.py','tests/test_scope_v17*.py','verification/scope-v17*.json','verification/scope-v18*.json','verification/scope-v17*.txt','dist/scope-v17-v18-figures-20261112/*'):
  for path in ROOT.glob(pattern):
   if path.name!='scope-v17-v18-package-20261112.json':add(path)
 for name in ('RESEARCH_LOG.he.md','CAPACITY_DIAGNOSIS_RESULTS.he.md','README.he.md','SCOPE_RESEARCH_HANDOFF.he.md','STANCE_RESULTS.he.md'):add(ROOT/name)
 for folder in (ROOT/'runs/colab-scope-v17-capacity/recovered',ROOT/'runs/scope-v18-factorial'):
  for path in folder.rglob('*.json'):add(path)
 files['research-packet.json']=(json.dumps({'parent_sha256':proof['parents_unchanged'],'scope':'New consumed-development capacity/factorial research,not deployment or new held-test success.','teacher_weights_included':False,'old_encoder_weights_included':False,'privacy':'No keys,account usage logs,user audio or user records. Only authored synthetic text.','fresh_sets_inferred':False},indent=2)+'\n').encode()
 target=ROOT/'dist/ourRecipes-hebrew-capacity-diagnosis-20261112.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
  for name,content in files.items():
   assert 'usage-private' not in name and not name.endswith(('.pt','.safetensors'))
   z.writestr(name,content)
  z.writestr('packet-sha256.json',json.dumps({n:digest(b) for n,b in files.items()},indent=2)+'\n')
 with zipfile.ZipFile(target) as z:
  assert z.testzip() is None
  for name,expected in json.loads(z.read('packet-sha256.json')).items():assert digest(z.read(name))==expected
 manifest={'file':str(target),'bytes':target.stat().st_size,'sha256':file_sha(target),'members':len(files)+1,'crc_and_all_member_sha256_verified':True,'parents_unchanged':proof['parents_unchanged']}
 (ROOT/'verification/scope-v17-v18-package-20261112.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest));return manifest


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--package',action='store_true');args=parser.parse_args();package() if args.package else report()

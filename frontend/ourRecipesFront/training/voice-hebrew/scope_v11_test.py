"""Once-only tests for fixed guarded-semantic method at all three seeds."""
import argparse,gc,hashlib,json,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v11_train import PLAN
from scope_v9_guarded import raw,measure
from scope_v11_data import DATA
from facts_v7_replay import REPLAY


def candidates(result):
 trials=result.get('trials',[])
 if not result.get('qualified_for_test') or len(trials)!=3 or {t['seed'] for t in trials}!={42,17,73} or not all(t['qualified'] and t['parent_actual_updates']>=4000 for t in trials):raise ValueError('Three-seed guarded qualification required')
 return trials


def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 root=Path(root);study=root/'recovered/study';trials=candidates(json.loads((study/'result.json').read_text()));plan=json.loads(PLAN.read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 output=root/'fresh-test-once';output.mkdir(exist_ok=False);torch.set_num_threads(2);start=time.monotonic();tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 proof={'study':'scope-v11-replay','test_sets':{},'scope':'Synthetic reference/binding only; ordinary deferral on reference texts is unmeasured and disqualifies. Fixed semantic selector/decoder/all3seeds; no method,weights or policy selected by tests.','real_cpu_inference':True,'human_reviewed':False,'physical_device_tested':False,'v5_fresh480_inferred':False,'original120_inferred':False}
 def one_set(name,rows):
  results=[]
  for t in trials:
   checkpoint=study/f"seed-{t['seed']}/model.pt";assert digest(checkpoint.read_bytes())==t['checkpoint_sha256'];state=torch.load(checkpoint,weights_only=True,map_location='cpu');model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();head.load_state_dict(state['head']);restore(model,state['adapters'])
   records=raw(model,tok,head,[r['text'] for r in rows]);measured=measure(rows,records,t['policy']);item={'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'policy':t['policy'],'metrics':measured,'raw':records}
   results.append(item);(output/f"{name}-{t['seed']}.json").write_text(json.dumps(item,ensure_ascii=False,indent=2)+'\n');del model,head;gc.collect()
  value={'texts':len(rows),'states_per_text':4,'trials':results,'all_passed':all(v['metrics']['passed'] for v in results)};proof['test_sets'][name]=value;return value
 v8=one_set('scope-v8',json.loads(DATA.read_text())['splits']['test'])
 if v8['all_passed']:
  assert digest(REPLAY.read_bytes())==json.loads((ROOT/'verification/facts-v7-replay-plan-20261112.json').read_text())['data_sha256']
  one_set('retained-v7',json.loads(REPLAY.read_text())['splits']['test'])
 proof['all_opened_tests_passed']=all(v['all_passed'] for v in proof['test_sets'].values());proof['seconds']=time.monotonic()-start
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/scope-v11-replay-test-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k!='test_sets'}));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

"""Open one frozen ensemble test once; V7 only after V8 passes. No selection."""
import argparse,json,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v10_train import PLAN
from scope_v10_evaluate import members,verify
from scope_v10_consensus import combine,measure
from scope_v9_hierarchy import raw
from scope_v9_data import DATA
from facts_v7_replay import REPLAY


def qualified(proof):
 if not proof.get('qualified_for_test') or [m['seed'] for m in proof.get('members',[])]!=[42,17,73] or proof.get('calibration_route_mismatches')!=0 or not proof.get('calibration',{}).get('passed') or not proof.get('native',{}).get('passed'):raise ValueError('Fixed three-member consensus qualification required')


def run(oldroot,newroot,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 start=time.monotonic();root=Path(newroot);dev=json.loads((root/'consensus-development/result.json').read_text());qualified(dev);plan=json.loads(PLAN.read_text());items=members(oldroot,newroot);verify(plan,base,items)
 assert dev['members']==[{'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'policy':t['policy']} for p,t in items]
 output=root/'fresh-test-once';output.mkdir(exist_ok=False);torch.set_num_threads(2)
 tok=AutoTokenizer.from_pretrained(base,local_files_only=True);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead()
 proof={'method':'Fixed ALL-three consensus, a single ensemble; not three independent quality repetitions','test_sets':{},'real_cpu_inference':True,'human_reviewed':False,'physical_device_tested':False,'v5_fresh480_inferred':False,'original120_inferred':False}
 def one(name,rows):
  all_records=[]
  for checkpoint,t in items:
   state=torch.load(checkpoint,map_location='cpu',weights_only=True);head.load_state_dict(state['head']);restore(model,state['adapters']);all_records.append(raw(model,tok,head,[r['text'] for r in rows]))
  m=measure(rows,combine(all_records,[t['policy'] for p,t in items]));v={'texts':len(rows),'states_per_text':4,'ensemble':m,'members':[t['seed'] for p,t in items]};proof['test_sets'][name]=v
  (output/f'{name}.json').write_text(json.dumps({'summary':v,'raw':all_records},ensure_ascii=False,indent=2)+'\n');return m['passed']
 if one('scope-v8',json.loads(DATA.read_text())['splits']['test']):
  assert digest(REPLAY.read_bytes())==json.loads((ROOT/'verification/facts-v7-replay-plan-20261112.json').read_text())['data_sha256']
  one('retained-v7',json.loads(REPLAY.read_text())['splits']['test'])
 proof['all_opened_tests_passed']=all(v['ensemble']['passed'] for v in proof['test_sets'].values());proof['seconds']=time.monotonic()-start
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/scope-v10-consensus-test-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False));return proof


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('oldroot');p.add_argument('newroot');p.add_argument('--base',required=True);a=p.parse_args();run(a.oldroot,a.newroot,a.base)

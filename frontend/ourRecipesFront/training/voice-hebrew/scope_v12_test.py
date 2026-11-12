"""Once-only frozen reference tests for the fixed evidence-validated ensemble."""
import json,time
from corpus import ROOT,digest
from scope_v10_evaluate import members,verify
from scope_v12_evidence import PLAN,measure
from scope_v9_hierarchy import raw
from scope_v9_data import DATA
from facts_v7_replay import REPLAY


def qualified(dev):
 if not dev.get('qualified_for_test') or not dev['calibration']['passed'] or not dev['native']['passed'] or dev['cpu_gpu_decision_mismatches']!=0 or [t['seed'] for t in dev['members']]!=[42,17,73]:raise ValueError('Frozen evidence method must pass all development gates')


def run(base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 root=ROOT/'runs/scope-v12-evidence';dev=json.loads((root/'result.json').read_text());qualified(dev);plan=json.loads(PLAN.read_text());items=members(ROOT/'runs/colab-scope-v9-guarded',ROOT/'runs/colab-scope-v10-consensus');verify(plan,base,items)
 for p,t in items:assert t['checkpoint_sha256']==plan['fixed_models'][str(t['seed'])]
 assert dev['members']==[{'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'policy':t['policy']} for p,t in items]
 output=root/'fresh-test-once';output.mkdir(exist_ok=False);start=time.monotonic();torch.set_num_threads(2);tok=AutoTokenizer.from_pretrained(base,local_files_only=True);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead()
 proof={'method':'One fixed3 ensemble plus explicit reference-evidence veto; not three independent quality repetitions','test_sets':{},'real_cpu_inference':True,'human_reviewed':False,'physical_device_tested':False,'v5_fresh480_inferred':False,'original120_inferred':False,'scope':'Single generic reference/binding tests, synthetic authored and correlated. Ordinary reference deferral disqualifies; live legacy named-action extraction not measured by these tests. Consumed326 validates actual saved T4 legacy proposals plus ingredient/verb guard separately.'}
 def one(name,rows):
  all_records=[]
  for checkpoint,t in items:
   state=torch.load(checkpoint,weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);all_records.append(raw(model,tok,head,[r['text'] for r in rows]))
  m=measure(rows,all_records,[t['policy'] for p,t in items]);summary={'texts':len(rows),'states_per_text':4,'ensemble':m};proof['test_sets'][name]=summary
  (output/f'{name}.json').write_text(json.dumps({'summary':summary,'raw':all_records},ensure_ascii=False,indent=2)+'\n');return m['passed']
 if one('scope-v8',json.loads(DATA.read_text())['splits']['test']):
  assert digest(REPLAY.read_bytes())==json.loads((ROOT/'verification/facts-v7-replay-plan-20261112.json').read_text())['data_sha256']
  one('retained-v7',json.loads(REPLAY.read_text())['splits']['test'])
 proof['all_opened_tests_passed']=all(v['ensemble']['passed'] for v in proof['test_sets'].values());proof['seconds']=time.monotonic()-start
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/scope-v12-evidence-test-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False));return proof


if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--base',required=True);a=p.parse_args();run(a.base)

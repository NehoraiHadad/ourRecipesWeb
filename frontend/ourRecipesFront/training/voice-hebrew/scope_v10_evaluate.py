"""Evaluate the frozen ALL-three ensemble on consumed development sets only."""
import argparse,hashlib,json,time
from pathlib import Path
from corpus import ROOT,digest,load_data
from scope_v10_train import PLAN
from scope_v10_consensus import combine,measure,transfer
from scope_v9_hierarchy import raw
from scope_v9_data import DATA


def members(oldroot,newroot):
 old=Path(oldroot)/'recovered/study';new=Path(newroot)/'recovered/study'
 return [(p/f'seed-{s}/model.pt',json.loads((p/f'seed-{s}/result.json').read_text())) for p,s in ((old,42),(old,17),(new,73))]


def verify(plan,base,items):
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 assert [t['seed'] for p,t in items]==[42,17,73]
 for p,t in items:
  assert digest(p.read_bytes())==t['checkpoint_sha256']
  assert t['parent_actual_updates']>=4000 and t['checks']['original_backbone_invariant']
  assert not t['parity']['route_mismatches'] and t['parity']['max_component_delta']<1e-4
 for p,t in items[:2]:assert t['checkpoint_sha256']==plan['existing_checkpoints'][str(t['seed'])]


def run(oldroot,newroot,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 torch.set_num_threads(2);start=time.monotonic();plan=json.loads(PLAN.read_text());items=members(oldroot,newroot);verify(plan,base,items);policies=[t['policy'] for p,t in items]
 output=Path(newroot)/'consensus-development';output.mkdir(exist_ok=False)
 rows=json.loads(DATA.read_text())['splits']['calibration'];cp=combine([t['raw_cpu_calibration'] for p,t in items],policies);gp=combine([t['raw_gpu_calibration'] for p,t in items],policies);cal=measure(rows,cp)
 proof={'method':'ALL-three fixed consensus','members':[{'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'policy':t['policy']} for p,t in items],'calibration':cal,'calibration_route_mismatches':sum(a!=b for a,b in zip(cp,gp)),'native':None,'qualified_for_test':False,'fresh_test_inference':False,'human_reviewed':False,'physical_device_tested':False,'independent_quality_repetitions':False}
 if cal['passed'] and cp==gp:
  cachepath=ROOT/'verification/scope-v10-consensus-feasibility-20261112.json';assert digest(cachepath.read_bytes())==plan['two_member_proof_sha256'];cache=json.loads(cachepath.read_text());texts=cache['raw_native']['texts']
  tok=AutoTokenizer.from_pretrained(base,local_files_only=True);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(items[2][0],map_location='cpu',weights_only=True);head.load_state_dict(state['head']);restore(model,state['adapters']);third=raw(model,tok,head,texts)
  f=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());old=f['rows'];recipes={r['id']:r for r in f['recipes']};recs,orows=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in orows if r['split']=='validation' and r.get('evaluation_kind')!='state'];assert texts==list(dict.fromkeys(r['utterance'] for r in old+guard))
  proof['native']=transfer(old,recipes,guard,recs,texts,combine(cache['raw_native']['members']+[third],policies));proof['qualified_for_test']=proof['native']['passed'];proof['raw_native_third']=third
 proof['seconds']=time.monotonic()-start
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/scope-v10-consensus-development-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in proof.items() if k not in ('calibration','raw_native_third')},ensure_ascii=False));return proof


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('oldroot');p.add_argument('newroot');p.add_argument('--base',required=True);a=p.parse_args();run(a.oldroot,a.newroot,a.base)

"""One opening, fixed V9 method/seeds/policies; no selection by held-out tests."""
import argparse,gc,hashlib,json,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v9 import PLAN,PRIORITY,decisions,accept
from scope_v9_data import DATA
from facts_v7 import score
from facts_v7_replay import REPLAY


def candidates(result):
 method=result.get('selected_method');trials=result.get('trials',[])
 if not result.get('qualified_for_test') or method not in PRIORITY or len(trials)!=3 or {t['seed'] for t in trials}!={42,17,73} or not all(t['variants'].get(method,{}).get('qualified') and t['actual_steps']>=4000 for t in trials):raise ValueError('Three-seed V9 qualification required')
 return method,trials


def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup,evaluate
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 from adapter_study import features
 root=Path(root);study=root/'recovered/study';method,trials=candidates(json.loads((study/'result.json').read_text()));plan=json.loads(PLAN.read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 output=root/'fresh-test-once';output.mkdir(exist_ok=False);start=time.monotonic();torch.set_num_threads(2);tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 proof={'study':'scope-v9','selected_method':method,'test_sets':{},'scope':'Synthetic reference head/state binding only; raw NN confidence remains distinct from policy routing flags. Fixed method and seeds, no retuning by test.','human_reviewed':False,'physical_device_tested':False,'real_cpu_inference':True,'v5_fresh480_inferred':False,'original120_inferred':False}
 def one_set(name,rows):
  results=[]
  for t in trials:
   variant=t['variants'][method];policy=variant['calibration'];folder=study/f"seed-{t['seed']}";checkpoint=folder/variant['checkpoint'];state=torch.load(checkpoint,weights_only=True,map_location='cpu')
   model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();head.load_state_dict(state['head']);restore(model,state['adapters'])
   raw=evaluate(head,features(model,tok,[r['text'] for r in rows],'cpu'),rows);flags=decisions(raw['predictions'],policy);m=score(rows,flags,.5);fallback=sum(r['label']!=14 and i==14 and accept((i,p),policy) for r,(i,p) in zip(rows,raw['predictions']))
   passed=m['false_proposals']==0 and m['effective_recall']>=.75 and m['correction_recall']>=.75 and fallback==0
   item={'seed':t['seed'],'checkpoint_sha256':digest(checkpoint.read_bytes()),'selector':variant['selector'],'policy_kind':policy['kind'],'threshold':policy.get('threshold'),'thresholds':policy.get('thresholds'),'raw_semantic':raw,'metrics':m,'unmeasured_reference_fallback':fallback,'passed':passed}
   results.append(item);(output/f"{name}-{t['seed']}.json").write_text(json.dumps(item,ensure_ascii=False,indent=2)+'\n');del model,head;gc.collect()
  value={'texts':len(rows),'states_per_text':4,'trials':results,'all_passed':all(r['passed'] for r in results)};proof['test_sets'][name]=value;return value
 v8=one_set('scope-v8',json.loads(DATA.read_text())['splits']['test'])
 if v8['all_passed']:
  assert digest(REPLAY.read_bytes())==json.loads((ROOT/'verification/facts-v7-replay-plan-20261112.json').read_text())['data_sha256']
  one_set('retained-v7',json.loads(REPLAY.read_text())['splits']['test'])
 proof['all_opened_tests_passed']=all(s['all_passed'] for s in proof['test_sets'].values());proof['seconds']=time.monotonic()-start
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/scope-v9-test-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k!='test_sets'}));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

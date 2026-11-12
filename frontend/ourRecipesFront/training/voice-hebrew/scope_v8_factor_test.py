"""One gated opening for fixed seeds; no model/threshold selection by test."""
import argparse,gc,hashlib,json,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v8_factor import PLAN
from scope_v8_data import DATA
from facts_v7_replay import REPLAY
from facts_v7 import score

def candidates(result):
 method=result.get('selected_method');foundation=result.get('selected_foundation')
 if method!='factor-wide' or foundation not in ('adapted','public'):raise ValueError('Three-seed factor qualification required')
 selected=[t for t in result.get('trials',[]) if t['arm']==method and t['foundation']==foundation]
 if not result.get('qualified_for_test') or {t['seed'] for t in selected}!={42,17,73} or len(selected)!=3 or not all(t.get('qualified') for t in selected):raise ValueError('Three-seed factor qualification required')
 return selected


def passes(metrics,fallback):
 return metrics['false_proposals']==0 and metrics['effective_recall']>=.75 and metrics['correction_recall']>=.75 and fallback==0


def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from certainty_adapter import restore
 from facts_v7_study import setup,evaluate
 from scope_v8_factor_head import FactorHead
 from adapter_study import features
 root=Path(root);study=root/'recovered/study';selected=candidates(json.loads((study/'result.json').read_text()));plan=json.loads(PLAN.read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 from scope_v8_public import obtain,WEIGHT_SHA
 if selected[0]['foundation']=='public':base=obtain(ROOT/'runs/public-dictabert-scope-cache')
 expected_body=WEIGHT_SHA if selected[0]['foundation']=='public' else plan['body_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==expected_body
 output=root/'fresh-test-once';output.mkdir(exist_ok=False);torch.set_num_threads(2);start=time.monotonic();tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 proof={'study':'scope-v8-factor','scope':'Synthetic reference head/binding, not voice/device/combined legacy extractor. State variants are not independent utterances. No selecting method/seed/threshold by test.','test_sets':{},'real_cpu_inference':True,'human_reviewed':False,'physical_device_tested':False,'v5_fresh480_inference':False,'original120_inference':False}
 def one_set(name,rows):
  trials=[]
  for t in selected:
   folder=study/f"{t['foundation']}-{t['arm']}-{t['seed']}";state=torch.load(folder/'best.pt',weights_only=True,map_location='cpu');model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,t['arm']);head=FactorHead(False);head.load_state_dict(state['head']);restore(model,state['adapters'])
   m=evaluate(head,features(model,tok,[r['text'] for r in rows],'cpu'),rows);threshold=t['selected']['threshold'];measured=score(rows,m['predictions'],threshold)
   fallback=sum(r['label']!=14 and label==14 and p>=threshold for r,(label,p) in zip(rows,m['predictions']))
   item={'seed':t['seed'],'method':t['arm'],'foundation':t['foundation'],'threshold':threshold,'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'semantic':m,'metrics':measured,'unmeasured_reference_fallback':fallback,'passed':passes(measured,fallback)}
   trials.append(item);(output/f"{name}-{t['seed']}.json").write_text(json.dumps(item,ensure_ascii=False,indent=2)+'\n');del model,head;gc.collect()
  value={'texts':len(rows),'new_root_groups':len({r['group'] for r in rows if not r['group'].startswith('old-other')}),'states_per_text':4,'trials':trials,'all_passed':all(t['passed'] for t in trials)}
  proof['test_sets'][name]=value;return value
 # Access/infer V8 test only after qualification and once-only marker above.
 v8=one_set('scope-v8',json.loads(DATA.read_text())['splits']['test'])
 if v8['all_passed']:
  assert digest(REPLAY.read_bytes())==json.loads((ROOT/'verification/facts-v7-replay-plan-20261112.json').read_text())['data_sha256']
  one_set('retained-v7',json.loads(REPLAY.read_text())['splits']['test'])
 proof['all_opened_tests_passed']=all(t['all_passed'] for t in proof['test_sets'].values());proof['seconds']=time.monotonic()-start
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/scope-v8-factor-test-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();d=run(a.root,a.base);print(json.dumps({k:v for k,v in d.items() if k!='test_sets'}))

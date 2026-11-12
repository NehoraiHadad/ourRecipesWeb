"""Post-selection error analysis on consumed V5 validation, no tuning/inference test."""
import argparse,json
from pathlib import Path
from corpus import ROOT,digest
from facts_v7 import JOINT,apply

def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import Head,setup,evaluate
 from certainty_adapter import restore
 from adapter_study import features
 from reference_train import metrics
 from research_metric_audit import measure
 root=Path(root);folder=root/'recovered/study/flat-narrow-42';trial=json.loads((folder/'result.json').read_text());threshold=trial['selected']['threshold'];torch.set_num_threads(2)
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'flat-narrow');tok=AutoTokenizer.from_pretrained(base,local_files_only=True);head=Head(True)
 state=torch.load(folder/'best.pt',weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters'])
 fixture=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());rows=fixture['rows'];recipes={r['id']:r for r in fixture['recipes']};texts=list(dict.fromkeys(r['utterance'] for r in rows))
 p=evaluate(head,features(model,tok,texts,'cpu'),[{'label':14} for t in texts])['predictions'];pred=dict(zip(texts,p));old=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];out={};origins={}
 for row in rows:
  label,confidence=pred[row['utterance']];fact=JOINT[label];fallback=old[row['id']]
  if confidence>=threshold and (fact[0]=='other' or (fact[1]=='nonassertion' and fallback['intent']!='report')):out[row['id']]=fallback;origins[row['id']]='legacy';continue
  if confidence<threshold:out[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};origins[row['id']]='abstain';continue
  recipe=recipes[row['recipe_id']];st={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  r=apply(fact,st,recipe['id'],'v1');out[row['id']]={'intent':'report' if r['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in r['changes']],'requiresReview':True};origins[row['id']]='reference-head'
 m=metrics(rows,recipes,out);effective=measure(rows,m['cases']);assert effective==trial['native']['old_validation']['effective'],'Diagnostic replay mismatch'
 lookup={r['id']:r for r in rows};errors=[]
 for case in m['cases']:
  row=lookup[case['id']];done=set(row['state']['completed']);gold={c['actionId']:c['done'] for c in case['gold']['changes']};actual={c['actionId']:c['done'] for c in case['actual']['changes']}
  false=[{'action_id':a,'value':v,'effective':(a in done)!=v} for a,v in actual.items() if a not in gold or gold[a]!=v]
  missed=[{'action_id':a,'value':v,'effective':(a in done)!=v} for a,v in gold.items() if a not in actual or actual[a]!=v]
  if false or missed:
   label,confidence=pred[row['utterance']];errors.append({'id':case['id'],'text':row['utterance'],'predicted_fact':JOINT[label],'confidence':confidence,'route':origins[row['id']],'false':false,'missed':missed,'gold':case['gold'],'actual':case['actual']})
 proof={'scope':'Known consumed validation only; no new training, threshold or selection. Exact metric reproduction checked.','threshold':threshold,'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'effective':effective,'errors':errors,'new_test_inference':False}
 (ROOT/'verification/facts-v7-replay-errors-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False,indent=2));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

"""Known consumed transfer/guard error tracing after fixed V9 selection."""
import argparse,json
from pathlib import Path
from corpus import ROOT,load_data
from scope_v9 import proposal_map,accept
from facts_v7 import JOINT

def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup,evaluate
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 from adapter_study import features
 from certainty_train import BASE
 from reference_train import metrics
 torch.set_num_threads(2);root=Path(root);folder=root/'recovered/study/seed-42';trial=json.loads((folder/'result.json').read_text());fixture=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());rows=fixture['rows'];recipes={r['id']:r for r in fixture['recipes']};recs,old=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old if r['split']=='validation' and r.get('evaluation_kind')!='state']
 texts=list(dict.fromkeys(r['utterance'] for r in rows+guard));tok=AutoTokenizer.from_pretrained(base,local_files_only=True);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead()
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']};records=[]
 for selector in ('semantic','safety'):
  state=torch.load(folder/f'{selector}-best.pt',weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);raw=evaluate(head,features(model,tok,texts,'cpu'),[{'label':14} for t in texts])['predictions'];pred=dict(zip(texts,raw))
  for kind in ('global','typed'):
   name=selector+'-'+kind;v=trial['variants'][name];policy=v['calibration'];mm=metrics(rows,recipes,proposal_map(rows,recipes,pred,baseline,policy));gg=metrics(guard,recs,proposal_map(guard,recs,pred,gb,policy));lookup={r['id']:r for r in rows+guard}
   assert mm['false_updates']==v['transfer']['old']['false_updates'] and gg['exact_proposals']==v['transfer']['guard']['exact_proposals']
   def detail(c):
    i,p=pred[c['utterance']];fact=JOINT[i];fallback=(fact[0]=='other' or fact[1]=='nonassertion') and accept((i,p),policy)
    return {'id':c['id'],'text':c['utterance'],'fact':fact,'confidence':p,'accepted':accept((i,p),policy),'route':'legacy' if fallback else 'semantic-or-abstain','gold':c['gold'],'actual':c['actual'],'state':lookup[c['id']]['state']}
   false=[detail(c) for c in mm['cases'] if c['false_updates']];changed=[{**detail(c),'original_legacy':gb[c['id']]} for c in gg['cases'] if c['actual']!=gb[c['id']]]
   records.append({'method':name,'old_false':false,'guard_changed_from_original_legacy':changed})
 out={'scope':'Post-selection consumed validation/guard only; exact aggregate reproduction, no model/threshold/test change','trials':records,'new_test_inference':False}
 (ROOT/'verification/scope-v9-errors-20261112.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2));return out

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

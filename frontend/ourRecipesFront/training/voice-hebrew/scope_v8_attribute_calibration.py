"""Empirical selective gates on each semantic attribute of a frozen factor head.
Decision flags are not model probabilities. No new weights or test access.
"""
import argparse,itertools,json,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v8_data import DATA
from scope_v8_typed_calibration import ACTIONABLE
from facts_v7 import JOINT,score,apply
GRID=(.5,.7,.85,.9,.95,.97,.99,.995,.999)


def accepted(record,thresholds):
 if record['label'] not in ACTIONABLE:return record['joint_confidence']>=.99
 return thresholds is not None and all(p>=t and p>.5 for p,t in zip(record['components'],thresholds))


def calibrate(rows,records):
 import numpy as np
 if len(rows)!=len(records):raise ValueError('Mismatched rows')
 cols=('true_proposals','false_proposals','correct_effective','correct_corrections')
 weights=np.array([[score([r],[(v['label'],1.)],.5)[c] for c in cols] for r,v in zip(rows,records)])
 components=np.array([r['components'] for r in records]);action=np.array([r['label'] in ACTIONABLE for r in records]);fixed=np.array([accepted(r,None) for r in records]);fixed[action]=False
 fallback=sum(r['label']!=14 and v['label']==14 and v['joint_confidence']>=.99 for r,v in zip(rows,records));best=None;grid=[]
 for t in (None,)+tuple(itertools.product(GRID,repeat=3)):
  mask=fixed.copy()
  if t is not None:mask|=action&np.all(components>=np.array(t),axis=1)&np.all(components>.5,axis=1)
  true,false,ef,co=(mask.astype(int)@weights).tolist();key=(false==0 and fallback==0,ef+co,true,*(t if t is not None else (2.,2.,2.)))
  candidate={'thresholds':t,'counts':dict(zip(cols,(true,false,ef,co))),'key':key};grid.append(candidate)
  if best is None or key>tuple(best['key']):best=candidate
 flags=[(v['label'],float(accepted(v,best['thresholds']))) for v in records];m=score(rows,flags,.5)
 for c in cols:assert m[c]==best['counts'][c],c
 return {'thresholds':best['thresholds'],'metrics':m,'grid':grid,'unmeasured_reference_fallback':fallback,
 'passed':m['false_proposals']==0 and m['effective_recall']>=.75 and m['correction_recall']>=.75 and fallback==0}


def raw_predictions(model,tok,head,texts,device='cpu'):
 import torch
 from adapter_study import features
 from facts_v7_study import ATTR
 x=features(model,tok,texts,device);head.eval()
 with torch.no_grad():
  z=head(x);parts=[p.softmax(-1) for p in z.split((3,4,4),dim=-1)];lp=head.logprobs(x);p,i=lp.exp().max(-1)
  labels=i.cpu().tolist();confidence=p.cpu().tolist();raw=[q.cpu().tolist() for q in parts]
 return [{'label':k,'joint_confidence':confidence[n],'components':[raw[j][n][ATTR[j].index(v)] for j,v in enumerate(JOINT[k])]} for n,k in enumerate(labels)]


def proposal_map(rows,recipes,pred,baseline,thresholds):
 output={}
 for row in rows:
  v=pred[row['utterance']];fact=JOINT[v['label']];fallback=baseline[row['id']]
  if fact[0]=='other' and accepted(v,thresholds):output[row['id']]=fallback;continue
  if fact[1]=='nonassertion' and accepted(v,thresholds) and fallback['intent']!='report':output[row['id']]=fallback;continue
  if not accepted(v,thresholds):output[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};continue
  recipe=recipes[row['recipe_id']];state={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  value=apply(fact,state,recipe['id'],'v1');output[row['id']]={'intent':'report' if value['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in value['changes']],'requiresReview':True}
 return output


def transfer(model,tok,head,thresholds):
 from corpus import load_data
 from certainty_train import BASE,compact
 from reference_train import metrics
 from research_metric_audit import measure
 f=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());rows=f['rows'];recipes={r['id']:r for r in f['recipes']};recs,old=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old if r['split']=='validation' and r.get('evaluation_kind')!='state']
 texts=list(dict.fromkeys(r['utterance'] for r in rows+guard));pred=dict(zip(texts,raw_predictions(model,tok,head,texts)))
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']}
 m=metrics(rows,recipes,proposal_map(rows,recipes,pred,baseline,thresholds));g=metrics(guard,recs,proposal_map(guard,recs,pred,gb,thresholds));lookup={r['id']:r for r in rows}
 cor=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])]
 checks={'old_effective':measure(rows,m['cases'])['effective_update_recall']>=.75,'old_corrections':sum(c['actual']['changes']==c['gold']['changes'] for c in cor)>=12,'old_false':m['false_updates']==0,
 'guard_false':g['false_updates']<=3,'guard_exact':g['exact_proposals']>=294,'guard_recall':g['update_recall']>=.876551724137931}
 return {'old':compact(m),'effective':measure(rows,m['cases']),'corrections_correct':sum(c['actual']['changes']==c['gold']['changes'] for c in cor),'guard':compact(g),'checks':checks,'passed':all(checks.values()),'actual_cpu_inference':True}


def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 torch.set_num_threads(2);start=time.monotonic();folder=Path(root)/'recovered/study/adapted-factor-wide-42';trial=json.loads((folder/'result.json').read_text());rows=json.loads(DATA.read_text())['splits']['calibration']
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(folder/'best.pt',weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 raw=raw_predictions(model,tok,head,[r['text'] for r in rows]);saved=trial['calibration']['predictions'];mismatch=sum(v['label']!=i for v,(i,p) in zip(raw,saved));delta=max(abs(v['joint_confidence']-p) for v,(_,p) in zip(raw,saved));assert mismatch==0 and delta<1e-5
 cal=calibrate(rows,raw);extra=transfer(model,tok,head,cal['thresholds']) if cal['passed'] else None
 proof={'scope':'Adaptive attribute confidence calibration on known493, no weight changes or tests. CPU raw attributes, same argmax/product labels as saved T4. Attribute decisions still require actual GPU parity/prospective17/73 before tests.',
 'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'calibration':cal,'cpu_vs_saved_gpu_joint':{'examples':len(rows),'label_mismatches':mismatch,'max_joint_confidence_delta':delta},'raw_calibration':raw,'transfer':extra,'seconds':time.monotonic()-start,'new_test_inference':False}
 (ROOT/'verification/scope-v8-attribute-feasibility-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'calibration_passed':cal['passed'],'thresholds':cal['thresholds'],'metrics':{k:v for k,v in cal['metrics'].items() if k!='failures'},'transfer':extra}));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

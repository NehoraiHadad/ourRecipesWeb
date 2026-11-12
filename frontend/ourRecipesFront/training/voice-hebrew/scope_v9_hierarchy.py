"""Hierarchical deferral vs mutation: independent learned route/attribute gates.
No lexical matching. Confidence floors are fixed before feasibility inference.
"""
import argparse,itertools,json,time
from pathlib import Path
from corpus import ROOT,digest,load_data
from facts_v7 import JOINT,score,apply
from scope_v9_data import DATA
from scope_v8_typed_calibration import ACTIONABLE
GRID=(.95,.97,.99,.995,.999)


def route(record,thresholds,readonly_threshold):
 # C_OTHER and S_UNSPEC were supervised as ordinary-route attributes. Their
 # route signal can defer to the independent legacy extractor without forcing
 # its ordinary utterances into remaining/marked action semantics.
 if record['ordinary_score']>=.5:return ('legacy',14)
 i=record['label'];fact=JOINT[i]
 if i in ACTIONABLE:
  return ('reference',i) if thresholds is not None and all(p>=t for p,t in zip(record['components'],thresholds)) else ('clarify',i)
 if fact[1]=='nonassertion' and record['joint_confidence']>=readonly_threshold:return ('readonly',i)
 return ('clarify',i)


def flags(records,thresholds,readonly_threshold):
 out=[]
 for v in records:
  kind,label=route(v,thresholds,readonly_threshold);out.append((label,float(kind in ('legacy','reference'))))
 return out


def calibrate(rows,records,readonly_threshold):
 candidates=[]
 for t in (None,)+tuple(itertools.product(GRID,repeat=3)):
  f=flags(records,t,readonly_threshold);m=score(rows,f,.5);fallback=sum(r['label']!=14 and route(v,t,readonly_threshold)[0]=='legacy' for r,v in zip(rows,records));eligible=m['false_proposals']==0 and fallback==0 and m['effective_recall']>=.75 and m['correction_recall']>=.75
  key=(eligible,m['false_proposals']==0 and fallback==0,m['correct_effective']+m['correct_corrections'],m['true_proposals'],*(t if t is not None else (2.,2.,2.)))
  candidates.append({'thresholds':t,'key':key,'metrics':m,'unmeasured_reference_fallback':fallback,'passed':eligible})
 chosen=max(candidates,key=lambda c:tuple(c['key']));return chosen,[{k:({a:b for a,b in v.items() if a!='failures'} if k=='metrics' else v) for k,v in c.items()} for c in candidates]


def raw(model,tok,head,texts,device='cpu'):
 import torch
 from facts_v7_study import ATTR
 from adapter_study import features
 x=features(model,tok,texts,device);head.eval()
 with torch.no_grad():
  z=head(x);parts=[p.softmax(-1) for p in z.split((3,4,4),dim=-1)];p,i=head.logprobs(x).exp().max(-1)
  values=[v.cpu().tolist() for v in parts];labels=i.cpu().tolist();joint=p.cpu().tolist()
 return [{'label':k,'joint_confidence':joint[n],'components':[values[j][n][ATTR[j].index(v)] for j,v in enumerate(JOINT[k])],'ordinary_score':values[1][n][3]*values[2][n][3]} for n,k in enumerate(labels)]


def proposals(rows,recipes,pred,baseline,thresholds,readonly_threshold):
 out={}
 for row in rows:
  v=pred[row['utterance']];kind,label=route(v,thresholds,readonly_threshold);fallback=baseline[row['id']]
  if kind=='legacy' or (kind=='readonly' and fallback['intent']!='report'):out[row['id']]=fallback;continue
  if kind!='reference':out[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};continue
  recipe=recipes[row['recipe_id']];state={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  value=apply(JOINT[label],state,recipe['id'],'v1');out[row['id']]={'intent':'report' if value['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in value['changes']],'requiresReview':True}
 return out


def transfer(model,tok,head,thresholds,readonly_threshold):
 from certainty_train import BASE,compact
 from reference_train import metrics
 from research_metric_audit import measure
 f=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());rows=f['rows'];recipes={r['id']:r for r in f['recipes']};recs,old=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old if r['split']=='validation' and r.get('evaluation_kind')!='state'];texts=list(dict.fromkeys(r['utterance'] for r in rows+guard));pred=dict(zip(texts,raw(model,tok,head,texts)))
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']};m=metrics(rows,recipes,proposals(rows,recipes,pred,baseline,thresholds,readonly_threshold));g=metrics(guard,recs,proposals(guard,recs,pred,gb,thresholds,readonly_threshold));lookup={r['id']:r for r in rows};eff=measure(rows,m['cases'])
 cor=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])];correct=sum(c['actual']['changes']==c['gold']['changes'] for c in cor)
 checks={'old_effective':eff['effective_update_recall']>=.75,'old_corrections':correct>=12,'old_false':m['false_updates']==0,'guard_false':g['false_updates']<=3,'guard_exact':g['exact_proposals']>=294,'guard_recall':g['update_recall']>=.876551724137931}
 return {'old':compact(m),'effective':eff,'corrections_correct':correct,'guard':compact(g),'checks':checks,'passed':all(checks.values()),'actual_cpu_inference':True,'old_false_cases':[c for c in m['cases'] if c['false_updates']]}


def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 torch.set_num_threads(2);start=time.monotonic();folder=Path(root)/'recovered/study/seed-42';trial=json.loads((folder/'result.json').read_text());readonly=trial['variants']['semantic-global']['calibration']['threshold'];rows=json.loads(DATA.read_text())['splits']['calibration']
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(folder/'semantic-best.pt',weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 records=raw(model,tok,head,[r['text'] for r in rows]);chosen,grid=calibrate(rows,records,readonly);extra=transfer(model,tok,head,chosen['thresholds'],readonly) if chosen['passed'] else None
 saved=trial['gpu_calibration']['semantic']['raw']['predictions'];assert all(v['label']==i and abs(v['joint_confidence']-p)<1e-5 for v,(i,p) in zip(records,saved))
 proof={'scope':'Adaptive decoder feasibility on frozen V9 semantic-best7000 seed42. Same already-used calibration/consumed guards, no weights or tests. Requires prospective17/73 and actual raw-component GPU parity before tests.',
 'checkpoint_sha256':digest((folder/'semantic-best.pt').read_bytes()),'readonly_threshold':readonly,'calibration':chosen,'calibration_grid':grid,'raw_calibration_cpu':records,'transfer':extra,'seconds':time.monotonic()-start,'new_test_inference':False}
 (ROOT/'verification/scope-v9-hierarchy-feasibility-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'calibration_passed':chosen['passed'],'thresholds':chosen['thresholds'],'metrics':{k:v for k,v in chosen['metrics'].items() if k!='failures'},'transfer':extra}));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

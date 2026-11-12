"""Composition of calibrated per-class abstention and strict attribute binding.
Uses actual saved CPU component outputs; does not change model weights.
"""
import argparse,json,time
from pathlib import Path
from corpus import ROOT,digest,load_data
from facts_v7 import JOINT,score,apply
from scope_v9_hierarchy import raw
from scope_v8_typed_calibration import ACTIONABLE
from scope_v9_data import DATA


def route(record,policy):
 if record['ordinary_score']>=.5:return ('legacy',14)
 i=record['label'];fact=JOINT[i];threshold=policy['thresholds'][i]
 if i in ACTIONABLE:
  okay=threshold is not None and record['joint_confidence']>=threshold and all(p>=.95 for p in record['components'])
  return ('reference',i) if okay else ('clarify',i)
 if fact[1]=='nonassertion' and record['joint_confidence']>=policy['readonly_threshold']:return ('readonly',i)
 return ('clarify',i)


def measure(rows,records,policy):
 flags=[(i,float(k in ('legacy','reference'))) for k,i in (route(v,policy) for v in records)];m=score(rows,flags,.5);fallback=sum(r['label']!=14 and route(v,policy)[0]=='legacy' for r,v in zip(rows,records))
 return {'metrics':m,'unmeasured_reference_fallback':fallback,'passed':m['false_proposals']==0 and m['effective_recall']>=.75 and m['correction_recall']>=.75 and fallback==0}


def proposals(rows,recipes,pred,baseline,policy):
 out={}
 for row in rows:
  kind,label=route(pred[row['utterance']],policy);fallback=baseline[row['id']]
  if kind=='legacy' or (kind=='readonly' and fallback['intent']!='report'):out[row['id']]=fallback;continue
  if kind!='reference':out[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};continue
  recipe=recipes[row['recipe_id']];state={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  result=apply(JOINT[label],state,recipe['id'],'v1');out[row['id']]={'intent':'report' if result['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in result['changes']],'requiresReview':True}
 return out


def transfer(model,tok,head,policy):
 from certainty_train import BASE,compact
 from reference_train import metrics
 from research_metric_audit import measure as effective
 f=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());rows=f['rows'];recipes={r['id']:r for r in f['recipes']};recs,old=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old if r['split']=='validation' and r.get('evaluation_kind')!='state'];texts=list(dict.fromkeys(r['utterance'] for r in rows+guard));pred=dict(zip(texts,raw(model,tok,head,texts)))
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']};m=metrics(rows,recipes,proposals(rows,recipes,pred,baseline,policy));g=metrics(guard,recs,proposals(guard,recs,pred,gb,policy));lookup={r['id']:r for r in rows};eff=effective(rows,m['cases']);cor=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])];correct=sum(c['actual']['changes']==c['gold']['changes'] for c in cor)
 checks={'old_effective':eff['effective_update_recall']>=.75,'old_corrections':correct>=12,'old_false':m['false_updates']==0,'guard_false':g['false_updates']<=3,'guard_exact':g['exact_proposals']>=294,'guard_recall':g['update_recall']>=.876551724137931}
 return {'old':compact(m),'effective':eff,'corrections_correct':correct,'guard':compact(g),'checks':checks,'passed':all(checks.values()),'actual_cpu_inference':True,'old_false_cases':[c for c in m['cases'] if c['false_updates']]}


def run(root,base):
 start=time.monotonic();folder=Path(root)/'recovered/study/seed-42';trial=json.loads((folder/'result.json').read_text());cached=json.loads((ROOT/'verification/scope-v9-hierarchy-feasibility-20261112.json').read_text());checkpoint=folder/'semantic-best.pt';assert digest(checkpoint.read_bytes())==cached['checkpoint_sha256'];rows=json.loads(DATA.read_text())['splits']['calibration'];policy={'thresholds':trial['variants']['semantic-typed']['calibration']['thresholds'],'readonly_threshold':trial['variants']['semantic-global']['calibration']['threshold'],'component_floor':.95,'ordinary_threshold':.5}
 cal=measure(rows,cached['raw_calibration_cpu'],policy);extra=None
 if cal['passed']:
  import torch
  from transformers import AutoModelForTokenClassification,AutoTokenizer
  from facts_v7_study import setup
  from scope_v8_factor_head import FactorHead
  from certainty_adapter import restore
  torch.set_num_threads(2);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(checkpoint,weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);tok=AutoTokenizer.from_pretrained(base,local_files_only=True);extra=transfer(model,tok,head,policy)
 proof={'scope':'Adaptive decoder composition on frozen V9 semantic best. Typed class-calibration unchanged; strict.95 component validation and ordinary deferral score.5 fixed before evaluation. Existing real CPU component cache reused; no weights or tests. Prospective seeds/fullcal GPU parity required.',
 'checkpoint_sha256':digest(checkpoint.read_bytes()),'raw_cpu_cache_sha256':digest((ROOT/'verification/scope-v9-hierarchy-feasibility-20261112.json').read_bytes()),'policy':policy,'calibration':cal,'transfer':extra,'seconds':time.monotonic()-start,'new_test_inference':False}
 (ROOT/'verification/scope-v9-guarded-feasibility-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'calibration_passed':cal['passed'],'metrics':{k:v for k,v in cal['metrics'].items() if k!='failures'},'transfer':extra}));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

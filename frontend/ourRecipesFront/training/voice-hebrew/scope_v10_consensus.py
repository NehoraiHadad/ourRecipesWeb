"""Fixed consensus feasibility on consumed development sets, never sealed tests.

An ensemble is a new method; failed individual V9 qualification stays failed.
This script neither promotes nor opens tests. Final prospective members are
42/17/73; two existing members provide only a cheap feasibility screen.
"""
import argparse,gc,json,time
from pathlib import Path
from corpus import ROOT,digest,load_data
from facts_v7 import score,JOINT,apply
from scope_v9_data import DATA
from scope_v9_guarded import route,proposals
from scope_v9_hierarchy import raw


def consensus(records,policies):
 if len(records)!=len(policies) or len(records)<2:raise ValueError('At least two aligned members required')
 votes=[route(r,p) for r,p in zip(records,policies)]
 # Ordinary routing never authorizes an update itself: the unchanged, separately
 # measured extractor handles it. Reference fallback on calibration is a failure.
 if any(k=='legacy' for k,i in votes):return ('legacy',14)
 if all(v==votes[0] for v in votes) and votes[0][0] in ('reference','readonly'):return votes[0]
 return ('clarify',14)


def combine(all_records,policies):
 if len({len(r) for r in all_records})!=1:raise ValueError('Unequal member row counts')
 return [consensus(list(items),policies) for items in zip(*all_records)]


def measure(rows,decisions):
 m=score(rows,[(i,float(k in ('reference','legacy'))) for k,i in decisions],.5)
 unmeasured=sum(r['label']!=14 and k=='legacy' for r,(k,i) in zip(rows,decisions))
 return {'metrics':m,'unmeasured_reference_fallback':unmeasured,'passed':m['false_proposals']==0 and m['effective_recall']>=.75 and m['correction_recall']>=.75 and unmeasured==0}


def proposal_map(rows,recipes,decisions,baseline):
 """Use the frozen state binder with a fixed decision, never labels or gold."""
 out={}
 for row in rows:
  kind,label=decisions[row['utterance']];fallback=baseline[row['id']]
  if kind=='legacy' or (kind=='readonly' and fallback['intent']!='report'):
   out[row['id']]=fallback;continue
  if kind!='reference':out[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};continue
  recipe=recipes[row['recipe_id']];state={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  bound=apply(JOINT[label],state,recipe['id'],'v1')
  out[row['id']]={'intent':'report' if bound['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in bound['changes']],'requiresReview':True}
 return out


def transfer(rows,recipes,guard,recs,texts,decisions):
 from certainty_train import BASE,compact
 from reference_train import metrics
 from research_metric_audit import measure as effective
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation']
 gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']}
 pred=dict(zip(texts,decisions));m=metrics(rows,recipes,proposal_map(rows,recipes,pred,baseline));g=metrics(guard,recs,proposal_map(guard,recs,pred,gb));eff=effective(rows,m['cases']);lookup={r['id']:r for r in rows}
 cor=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])]
 correct=sum(c['actual']['changes']==c['gold']['changes'] for c in cor)
 checks={'old_false':m['false_updates']==0,'old_effective':eff['effective_update_recall']>=.75,'old_corrections':correct>=12,'guard_false':g['false_updates']<=3,'guard_exact':g['exact_proposals']>=294,'guard_recall':g['update_recall']>=.876551724137931}
 return {'old':compact(m),'effective':eff,'corrections_correct':correct,'guard':compact(g),'checks':checks,'passed':all(checks.values()),'old_false_cases':[c for c in m['cases'] if c['false_updates']]}


def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 torch.set_num_threads(2);start=time.monotonic();root=Path(root);study=root/'recovered/study'
 plan=json.loads((ROOT/'verification/scope-v10-consensus-plan-20261112.json').read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 trials=[json.loads((study/f'seed-{s}/result.json').read_text()) for s in (42,17)];policies=[t['policy'] for t in trials]
 rows=json.loads(DATA.read_text())['splits']['calibration'];cal=measure(rows,combine([t['raw_cpu_calibration'] for t in trials],policies))
 proof={'stage':'two-member adaptive feasibility only','members':[42,17],'calibration':cal,'native':None,'prospective_three_member_qualified':False,'test_inference':False,'human_reviewed':False,'physical_device_tested':False}
 if cal['passed']:
  fixture=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());old=fixture['rows'];recipes={r['id']:r for r in fixture['recipes']};recs,orows=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in orows if r['split']=='validation' and r.get('evaluation_kind')!='state'];texts=list(dict.fromkeys(r['utterance'] for r in old+guard));all_records=[]
  tok=AutoTokenizer.from_pretrained(base,local_files_only=True);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead()
  for t in trials:
   checkpoint=study/f"seed-{t['seed']}/model.pt";assert digest(checkpoint.read_bytes())==t['checkpoint_sha256'];state=torch.load(checkpoint,map_location='cpu',weights_only=True);head.load_state_dict(state['head']);restore(model,state['adapters']);all_records.append(raw(model,tok,head,texts))
  proof['native']=transfer(old,recipes,guard,recs,texts,combine(all_records,policies));proof['raw_native']={'texts':texts,'members':all_records};del model,head;gc.collect()
 proof['passed_feasibility']=cal['passed'] and proof['native'] is not None and proof['native']['passed'];proof['seconds']=time.monotonic()-start
 (ROOT/'verification/scope-v10-consensus-feasibility-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in proof.items() if k not in ('calibration','raw_native')},ensure_ascii=False));return proof


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

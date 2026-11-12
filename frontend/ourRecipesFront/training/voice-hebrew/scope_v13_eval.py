"""Compose stance-only veto with the unchanged V12 base; old sets are regression.
Fresh evaluation is once-only and only after fixed classifier+regression gates.
"""
import argparse,json,time
from pathlib import Path
import torch
from corpus import ROOT,digest,load_data
from facts_v7 import JOINT
from facts_v7_replay import REPLAY
from scope_v9_data import DATA as OLD_DATA
from scope_v10_evaluate import members
from scope_v10_consensus import measure as measure_decisions,proposal_map
from scope_v12_evidence import decide
from evidence_guard import validate as recipe_validate
from scope_v13_data import DATA
from scope_v13_features import load_encoder,records_from_features
from adapter_study import features
from certainty_adapter import restore
from scope_v13_stance import StanceHead,probabilities,metrics,veto
from scope_v13_train import PLAN
from scope_v13_log import RUN,event


def verify():
 plan=json.loads(PLAN.read_text())
 for n,h in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==h,n
 assert digest(DATA.read_bytes())==plan['data_sha256'];items=members(ROOT/'runs/colab-scope-v9-guarded',ROOT/'runs/colab-scope-v10-consensus')
 assert digest((ROOT/'verification/scope-v12-evidence-plan-20261112.json').read_bytes())==plan['parent_plan_sha256']
 for p,t in items:assert digest(p.read_bytes())==t['checkpoint_sha256']==plan['base_checkpoints'][str(t['seed'])]
 return plan,items


def compose(texts,records,policies,p,threshold):
 if len(records)!=3 or any(len(v)!=len(texts) for v in records) or len(p)!=len(texts):raise ValueError('Unaligned composition')
 return [veto(decide(t,list(rs),policies),q,threshold) for t,rs,q in zip(texts,zip(*records),p)]


def head_for(trial):
 folder=RUN/'heads'/f"{trial['arm']}-{trial['seed']}";p=folder/'best.pt';assert digest(p.read_bytes())==trial['checkpoint_sha256'];state=torch.load(p,weights_only=True);head=StanceHead(trial['arm']);head.load_state_dict(state['head']);return head


def native(old,recipes,guard,recs,pred):
 from certainty_train import BASE,compact
 from reference_train import metrics as proposal_metrics
 from research_metric_audit import measure as effective
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']}
 def proposals(rows,rc,base):
  out=proposal_map(rows,rc,pred,base)
  for r in rows:
   if pred[r['utterance']][0]=='legacy':out[r['id']]=recipe_validate(rc[r['recipe_id']],r['utterance'],out[r['id']])['proposal']
  return out
 m=proposal_metrics(old,recipes,proposals(old,recipes,baseline));g=proposal_metrics(guard,recs,proposals(guard,recs,gb));eff=effective(old,m['cases']);lookup={r['id']:r for r in old};cor=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])];correct=sum(c['actual']['changes']==c['gold']['changes'] for c in cor)
 checks={'old_false':m['false_updates']==0,'old_effective':eff['effective_update_recall']>=.75,'old_corrections':correct>=12,'guard_false':g['false_updates']==0,'guard_exact':g['exact_proposals']>=296,'guard_recall':g['update_recall']>=208/232}
 return {'old':compact(m),'effective':eff,'corrections_correct':correct,'guard':compact(g),'checks':checks,'passed':all(checks.values())}


def regression():
 torch.set_num_threads(2);plan,items=verify();policies=[t['policy'] for p,t in items];trials=json.loads((RUN/'training.json').read_text())['trials'];sets={};old=json.loads(OLD_DATA.read_text())['splits']
 sets['old_calibration']=(old['calibration'],[t['raw_cpu_calibration'] for p,t in items])
 for name,path,rows in (('consumed_v8','scope-v8',old['test']),('consumed_v7','retained-v7',json.loads(REPLAY.read_text())['splits']['test'])):
  records=json.loads((ROOT/f'runs/scope-v12-evidence/fresh-test-once/{path}.json').read_text())['raw'];sets[name]=(rows,records)
 cache=json.loads((ROOT/'verification/scope-v10-consensus-feasibility-20261112.json').read_text())['raw_native'];third=json.loads((ROOT/'verification/scope-v12-evidence-development-20261112.json').read_text())['raw_third_native'];native_records=cache['members']+[third];native_texts=cache['texts']
 f=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());oldrows=f['rows'];recipes={r['id']:r for r in f['recipes']};recs,orig=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in orig if r['split']=='validation' and r.get('evaluation_kind')!='state']
 # Recover feature rows for already prepared training material; only compute
 # missing known regression texts. No fresh-test text is ever in this map.
 data=json.loads(DATA.read_text())['splits'];feature_map={}
 for split in ('train','dev','calibration'):
  x=torch.load(RUN/f'features/{split}.pt',weights_only=True)['features']
  for r,v in zip(data[split],x):feature_map[r['text']]=v
 all_texts=list(dict.fromkeys([r['text'] for rows,records in sets.values() for r in rows]+native_texts));missing=[t for t in all_texts if t not in feature_map]
 if missing:
  event('regression_feature_extraction_started',texts=len(missing),fresh_test_inference=False);model,tok,refhead=load_encoder();x=features(model,tok,missing,'cpu')
  for t,v in zip(missing,x):feature_map[t]=v
  del model,refhead
 matrix=lambda texts:torch.stack([feature_map[t] for t in texts])
 base_pred=dict(zip(native_texts,compose(native_texts,native_records,policies,[1.]*len(native_texts),0.)))
 control=native(oldrows,recipes,guard,recs,base_pred);assert control['old']['false_updates']==0 and control['guard']['exact_proposals']==296 and control['effective']['correct_effective_updates']==28 and control['corrections_correct']==14
 results=[]
 for t in trials:
  if not t['qualified_classifier']:continue
  head=head_for(t);threshold=t['calibration']['threshold'];measured={}
  for name,(rows,records) in sets.items():
   texts=[r['text'] for r in rows];p=probabilities(head,matrix(texts));measured[name]=measure_decisions(rows,compose(texts,records,policies,p,threshold))
  p=probabilities(head,matrix(native_texts));n=native(oldrows,recipes,guard,recs,dict(zip(native_texts,compose(native_texts,native_records,policies,p,threshold))))
  passed=all(v['passed'] for v in measured.values()) and n['passed'];r={'arm':t['arm'],'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'threshold':threshold,'sets':measured,'native':n,'passed':passed};results.append(r);event('regression_complete',arm=t['arm'],seed=t['seed'],passed=passed,old_effective=n['effective']['correct_effective_updates'],old_corrections=n['corrections_correct'],fresh_test_inference=False)
 eligible=[arm for arm in ('linear','mlp64') if {r['seed'] for r in results if r['arm']==arm and r['passed']}=={42,17,73}];selected=eligible[0] if eligible else None
 proof={'selected_arm':selected,'primary_seed':42,'qualified_for_fresh_test':selected is not None,'results':results,'v12_control':control,'all_sets_consumed_regression_only':True,'consumed_v7_reference_training_replay':True,'fresh_test_inference':False}
 (RUN/'regression.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');event('method_selected',selected_arm=selected,qualified_for_fresh_test=selected is not None,primary_seed=42,reason='fixed architecture priority among three-seed classifier and regression passes');return proof


def fresh():
 torch.set_num_threads(2);plan,items=verify();reg=json.loads((RUN/'regression.json').read_text());assert reg['qualified_for_fresh_test'];arm=reg['selected_arm'];training=json.loads((RUN/'training.json').read_text())['trials'];trials=[t for t in training if t['arm']==arm];assert {t['seed'] for t in trials}=={42,17,73};output=RUN/'fresh-test-once';output.mkdir(exist_ok=False);data=json.loads(DATA.read_text())['splits'];model,tok,refhead=load_encoder();policies=[t['policy'] for p,t in items];proof={'selected_arm':arm,'primary_seed':42,'sets':{},'real_cpu_inference':True,'human_reviewed':False,'recorded_speech':False,'physical_device_tested':False,'encoder_updated':False,'original120_and_v5fresh480_inferred':False}
 def one(name):
  rows=data[name];texts=[r['text'] for r in rows];event('fresh_set_opened',set=name,rows=len(rows),data_sha256=plan['data_sha256'],selected_arm=arm,only_once=True);records=[];x42=None;baseline_allow=None
  for checkpoint,t in items:
   state=torch.load(checkpoint,weights_only=True,map_location='cpu');refhead.load_state_dict(state['head']);restore(model,state['adapters']);x=features(model,tok,texts,'cpu');records.append(records_from_features(refhead,x))
   if t['seed']==42:
    x42=x
    with torch.no_grad():baseline_allow=refhead(x).split((3,4,4),dim=-1)[1].softmax(-1)[:,0].tolist()
  baseline=measure_decisions(rows,compose(texts,records,policies,[1.]*len(rows),0.));out=[]
  for t in trials:
   p=probabilities(head_for(t),x42);m=metrics(rows,p,t['calibration']['threshold']);pipe=measure_decisions(rows,compose(texts,records,policies,p,t['calibration']['threshold']));required=.85 if name=='natural_test' else .9;okay=m['unsafe_allowed']==0 and m['asserted_recall']>=required and pipe['passed'];out.append({'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'threshold':t['calibration']['threshold'],'classifier':m,'pipeline':pipe,'passed':okay,'allow_probabilities':p})
  summary={'rows':len(rows),'classifier_required_asserted_recall':.85 if name=='natural_test' else .9,'baseline_v12_pipeline':baseline,'baseline_seed42_commitment_at_fixed_point95':metrics(rows,baseline_allow,.95),'trials':out,'all_passed':all(t['passed'] for t in out),'encoder_passes':3,'fourth_encoder_pass':False};proof['sets'][name]=summary
  (output/f'{name}.json').write_text(json.dumps({'summary':summary,'raw_base':records},ensure_ascii=False,indent=2)+'\n');event('fresh_set_scored',set=name,all_passed=summary['all_passed'],encoder_passes=3);return summary['all_passed']
 if one('test'):one('natural_test')
 proof['all_opened_sets_passed']=all(v['all_passed'] for v in proof['sets'].values());proof['qualified_all_fresh']=len(proof['sets'])==2 and proof['all_opened_sets_passed'];(output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');event('fresh_evaluation_complete',all_opened_sets_passed=proof['all_opened_sets_passed'],sets=list(proof['sets']),no_post_test_changes=True);return proof


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--fresh',action='store_true');a=p.parse_args();fresh() if a.fresh else regression()

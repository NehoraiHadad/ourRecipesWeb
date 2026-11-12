"""Fixed three-member vote plus explicit evidence veto. New CPU-only method.
All failed individual/consensus/data-ablation outcomes remain failed. No weights
are changed, and evidence never repairs or invents a proposed target.
"""
import argparse,collections,json,time
from pathlib import Path
from corpus import ROOT,digest,load_data
from facts_v7 import JOINT
from scope_v9_guarded import route
from scope_v9_hierarchy import raw
from scope_v10_consensus import measure as measure_decisions,proposal_map
from scope_v10_evaluate import members,verify
from reference_evidence import validate
from evidence_guard import validate as recipe_validate
from scope_v9_data import DATA
PLAN=ROOT/'verification/scope-v12-evidence-plan-20261112.json'


def decide(text,records,policies):
 if len(records)!=3 or len(policies)!=3:raise ValueError('The fixed three members are required')
 votes=[route(r,p) for r,p in zip(records,policies)]
 if any(k=='legacy' for k,i in votes):candidate=('legacy',14)
 else:
  counts=collections.Counter(votes);candidate=next((v for v,n in counts.items() if n>=2 and v[0] in ('reference','readonly')),('clarify',14))
 return validate(text,candidate,JOINT)[0]


def decisions(texts,all_records,policies):
 if len(all_records)!=3 or any(len(r)!=len(texts) for r in all_records):raise ValueError('All three aligned rows required')
 return [decide(t,list(rs),policies) for t,rs in zip(texts,zip(*all_records))]


def measure(rows,all_records,policies):return measure_decisions(rows,decisions([r['text'] for r in rows],all_records,policies))


def native(old,recipes,guard,recs,texts,all_records,policies):
 from certainty_train import BASE,compact
 from reference_train import metrics
 from research_metric_audit import measure as effective
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']};pred=dict(zip(texts,decisions(texts,all_records,policies)));rejections=[]
 def proposals(rows,rc,original):
  output=proposal_map(rows,rc,pred,original)
  for r in rows:
   if pred[r['utterance']][0]=='legacy':
    checked=recipe_validate(rc[r['recipe_id']],r['utterance'],output[r['id']]);output[r['id']]=checked['proposal']
    if checked['rejected']:rejections.append({'id':r['id'],'rejected':checked['rejected']})
  return output
 m=metrics(old,recipes,proposals(old,recipes,baseline));g=metrics(guard,recs,proposals(guard,recs,gb));eff=effective(old,m['cases']);lookup={r['id']:r for r in old};cor=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])];correct=sum(c['actual']['changes']==c['gold']['changes'] for c in cor)
 checks={'old_false':m['false_updates']==0,'old_effective':eff['effective_update_recall']>=.75,'old_corrections':correct>=12,'guard_false':g['false_updates']==0,'guard_exact':g['exact_proposals']>=296,'guard_recall':g['update_recall']>=208/232}
 return {'old':compact(m),'effective':eff,'corrections_correct':correct,'guard':compact(g),'checks':checks,'passed':all(checks.values()),'old_false_cases':[c for c in m['cases'] if c['false_updates']],'recipe_evidence_rejections':rejections}


def run(base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 torch.set_num_threads(2);start=time.monotonic();plan=json.loads(PLAN.read_text());items=members(ROOT/'runs/colab-scope-v9-guarded',ROOT/'runs/colab-scope-v10-consensus');verify(plan,base,items);policies=[t['policy'] for p,t in items]
 for p,t in items:assert t['checkpoint_sha256']==plan['fixed_models'][str(t['seed'])]
 root=ROOT/'runs/scope-v12-evidence';root.mkdir(exist_ok=False)
 rows=json.loads(DATA.read_text())['splits']['calibration'];all_cp=[t['raw_cpu_calibration'] for p,t in items];all_gp=[t['raw_gpu_calibration'] for p,t in items];cal=measure(rows,all_cp,policies);cp=decisions([r['text'] for r in rows],all_cp,policies);gp=decisions([r['text'] for r in rows],all_gp,policies)
 proof={'method':'Fixed3 vote plus reference/evidence veto; one ensemble, not independent replications','members':[{'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'policy':t['policy']} for p,t in items],'calibration':cal,'cpu_gpu_decision_mismatches':sum(a!=b for a,b in zip(cp,gp)),'native':None,'qualified_for_test':False,'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False}
 if cal['passed'] and cp==gp:
  cachepath=ROOT/'verification/scope-v10-consensus-feasibility-20261112.json';assert digest(cachepath.read_bytes())==plan['two_member_proof_sha256'];cache=json.loads(cachepath.read_text());texts=cache['raw_native']['texts']
  tok=AutoTokenizer.from_pretrained(base,local_files_only=True);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(items[2][0],weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);third=raw(model,tok,head,texts)
  f=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());old=f['rows'];recipes={r['id']:r for r in f['recipes']};recs,orows=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in orows if r['split']=='validation' and r.get('evaluation_kind')!='state'];assert texts==list(dict.fromkeys(r['utterance'] for r in old+guard))
  proof['native']=native(old,recipes,guard,recs,texts,cache['raw_native']['members']+[third],policies);proof['qualified_for_test']=proof['native']['passed'];proof['raw_third_native']=third
 proof['seconds']=time.monotonic()-start
 (root/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/scope-v12-evidence-development-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k not in ('calibration','raw_third_native')},ensure_ascii=False));print('calibration',json.dumps({k:v for k,v in cal['metrics'].items() if k!='failures'}));return proof


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--base',required=True);a=p.parse_args();run(a.base)

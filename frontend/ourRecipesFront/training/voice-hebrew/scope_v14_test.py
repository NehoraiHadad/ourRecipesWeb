"""New held commitment/operator and naturalistic tests, gated and once-only."""
import json,time
import torch
from corpus import ROOT,digest
from scope_v14_stance import PLAN
from scope_v13_data import DATA
from scope_v13_stance import StanceHead,probabilities,metrics
from scope_v13_features import load_encoder,records_from_features
from scope_v13_eval import compose
from scope_v10_evaluate import members
from scope_v10_consensus import measure as measure_decisions
from certainty_adapter import restore
from adapter_study import features


def candidates(study):
 if not study.get('qualified_for_fresh_test') or len(study['trials'])!=3 or {t['seed'] for t in study['trials']}!={42,17,73} or not all(t['qualified'] for t in study['trials']):raise ValueError('Three qualified stance adapters required')
 return study['trials']


def run():
 torch.set_num_threads(2);plan=json.loads(PLAN.read_text())
 for n,h in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==h,n
 for n,h in plan['input_artifacts'].items():assert digest((ROOT/n).read_bytes())==h,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 study=ROOT/'runs/colab-scope-v14-stance/recovered/study';trials=candidates(json.loads((study/'result.json').read_text()));root=ROOT/'runs/scope-v14-stance-eval';root.mkdir(exist_ok=False);output=root/'fresh-test-once';output.mkdir();model,tok,refhead=load_encoder();items=members(ROOT/'runs/colab-scope-v9-guarded',ROOT/'runs/colab-scope-v10-consensus');policies=[t['policy'] for p,t in items];data=json.loads(DATA.read_text())['splits'];proof={'sets':{},'primary_seed':42,'real_cpu_inference':True,'recorded_speech':False,'human_reviewed':False,'physical_device_tested':False,'original120_and_v5fresh480_inferred':False,'base_v12_encoders_unchanged':True};start=time.monotonic()
 def one(name):
  rows=data[name];texts=[r['text'] for r in rows];records=[]
  for checkpoint,t in items:
   state=torch.load(checkpoint,weights_only=True,map_location='cpu');refhead.load_state_dict(state['head']);restore(model,state['adapters']);records.append(records_from_features(refhead,features(model,tok,texts,'cpu')))
  baseline=measure_decisions(rows,compose(texts,records,policies,[1.]*len(rows),0.));results=[]
  for t in trials:
   checkpoint=study/f"seed-{t['seed']}/best.pt";assert digest(checkpoint.read_bytes())==t['checkpoint_sha256'];state=torch.load(checkpoint,weights_only=True,map_location='cpu');head=StanceHead('mlp64');head.load_state_dict(state['head']);restore(model,state['adapters']);p=probabilities(head,features(model,tok,texts,'cpu'));m=metrics(rows,p,t['calibration']['threshold']);pipe=measure_decisions(rows,compose(texts,records,policies,p,t['calibration']['threshold']));required=.85 if name=='natural_test' else .9;passed=m['unsafe_allowed']==0 and m['asserted_recall']>=required and pipe['passed'];results.append({'seed':t['seed'],'checkpoint_sha256':t['checkpoint_sha256'],'threshold':t['calibration']['threshold'],'classifier':m,'pipeline':pipe,'passed':passed,'allow_probabilities':p})
  v={'rows':len(rows),'baseline_v12_pipeline':baseline,'trials':results,'all_passed':all(r['passed'] for r in results),'validation_encoder_passes':6,'deployment_primary_encoder_passes':4};proof['sets'][name]=v;(output/f'{name}.json').write_text(json.dumps({'summary':v,'raw_base':records},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'set':name,'all_passed':v['all_passed']}),flush=True);return v['all_passed']
 if one('test'):one('natural_test')
 proof['qualified_all_fresh']=len(proof['sets'])==2 and all(v['all_passed'] for v in proof['sets'].values());proof['seconds']=time.monotonic()-start;(output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');return proof


if __name__=='__main__':run()

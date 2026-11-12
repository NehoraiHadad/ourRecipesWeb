"""Native CPU vs saved real GPU calibration predictions, never a fresh test."""
import argparse,gc,json,hashlib,time
from pathlib import Path
from corpus import ROOT,digest,load_data
from facts_v7 import DATA,JOINT,apply
from facts_v7_study import Head,setup,evaluate
from certainty_adapter import restore
from adapter_study import features

def prior_diagnostic(model,tok,head,threshold):
 from certainty_train import compact
 from reference_train import metrics
 from research_metric_audit import measure
 fixture=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());rows=fixture['rows'];recipes={r['id']:r for r in fixture['recipes']}
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation']
 texts=list(dict.fromkeys(r['utterance'] for r in rows));x=features(model,tok,texts,'cpu');p=evaluate(head,x,[{'label':14} for t in texts])['predictions'];pred=dict(zip(texts,p));out={}
 for row in rows:
  label,confidence=pred[row['utterance']];fact=JOINT[label];old=baseline[row['id']]
  if confidence>=threshold and (fact[0]=='other' or (fact[1]=='nonassertion' and old['intent']!='report')):out[row['id']]=old;continue
  if confidence<threshold:out[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};continue
  recipe=recipes[row['recipe_id']];state={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  r=apply(fact,state,recipe['id'],'v1');out[row['id']]={'intent':'report' if r['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in r['changes']],'requiresReview':True}
 m=metrics(rows,recipes,out);lookup={r['id']:r for r in rows};corrections=[c for c in m['cases'] if lookup[c['id']].get('reference_mode')=='completed_not_done']
 # Some fixture schemas carry the mode only in scenario; derive correction from actual gold and prior done set.
 corrections=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])]
 return {'scope':'Post-selection diagnostic on consumed V5 validation, same480 cases as V6; no threshold/weight/model selection. Not a fresh test.', 'metrics':compact(m),'effective':measure(rows,m['cases']),
 'corrections_required':len(corrections),'corrections_correct':sum(c['actual']['changes']==c['gold']['changes'] for c in corrections),
 'reference_failures':[{'id':c['id'],'text':lookup[c['id']]['utterance'],'gold':c['gold'],'actual':c['actual']} for c in corrections if c['actual']['changes']!=c['gold']['changes']]}

def run(root,base):
 import torch
 from transformers import AutoTokenizer,AutoModelForTokenClassification
 from safetensors.torch import load_file
 from certainty_train import native_baseline,BASE
 start=time.monotonic();torch.set_num_threads(2);study=Path(root)/'recovered/study';data=json.loads(DATA.read_text())['splits']['calibration']
 plan=json.loads((study/'plan.json').read_text());assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 result=json.loads((study/'result.json').read_text());proof=[];tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 # Gold-free native fallback verification before any research fine-tuning is loaded.
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval()
 recs,rows=load_data(ROOT/'runs/state-v13-preflight/shared');rows=[r for r in rows if r['split']=='validation' and r.get('evaluation_kind')!='state'][:6]
 cfg=json.loads((BASE/'run-config.json').read_text());bt=json.loads((BASE/'research-decision.json').read_text())['threshold']
 actual,meta=native_baseline(model,tok,rows,recs,cfg['span_profile'],bt)
 cached={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']}
 mismatches=[r['id'] for r in rows if actual[r['id']]!=cached[r['id']]]
 if mismatches:raise ValueError('Original fallback parity mismatch: '+str(mismatches))
 del model;gc.collect()
 for trial in result['trials']:
  arm=trial['arm'];folder=study/f'{arm}-42';saved=trial['calibration']['predictions'];selected=[]
  for label in range(15):selected.append(next(i for i,r in enumerate(data) if r['label']==label))
  selected+=sorted(range(len(data)),key=lambda i:abs(saved[i][1]-trial['selected']['threshold']))[:4];selected=list(dict.fromkeys(selected))
  model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,arm)
  state=torch.load(folder/'best.pt',weights_only=True,map_location='cpu');head=Head(arm.startswith('flat'));head.load_state_dict(state['head']);restore(model,state['adapters'])
  if arm.endswith('full'):model.load_state_dict(load_file(str(folder/'best-body.safetensors')))
  rows_subset=[data[i] for i in selected];x=features(model,tok,[r['text'] for r in rows_subset],'cpu');native=evaluate(head,x,rows_subset)['predictions']
  cls=[];route=[];max_delta=0
  for index,(label,confidence) in zip(selected,native):
   old,p=saved[index];max_delta=max(max_delta,abs(confidence-p))
   if label!=old:cls.append(data[index]['id'])
   if (label,confidence>=trial['selected']['threshold'])!=(old,p>=trial['selected']['threshold']):route.append(data[index]['id'])
  p={'arm':arm,'examples':len(selected),'labels_mismatch':cls,'threshold_decision_mismatch':route,'max_confidence_abs_delta':max_delta,'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'real_cpu_and_t4':True}
  p['prior_v5_validation']=prior_diagnostic(model,tok,head,trial['selected']['threshold']);proof.append(p);print(json.dumps({k:v for k,v in p.items() if k!='prior_v5_validation'}),flush=True);del model,head;gc.collect()
 output={'study':'facts-v7','native_vs_gpu':proof,'fallback_native':{**meta,'proposal_mismatches':0},'seconds':time.monotonic()-start,'test_inference':False,'physical_device_tested':False,'human_reviewed':False}
 (ROOT/'verification/facts-v7-native-20261112.json').write_text(json.dumps(output,indent=2)+'\n');return output

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

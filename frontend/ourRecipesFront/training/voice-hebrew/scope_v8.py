"""Scope/reference data pilot; conditional wider LoRA and fixed-seed replication.
No test inference or threshold changes based on consumed transfer validation.
"""
import argparse,gc,hashlib,json,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v8_data import DATA
PLAN=ROOT/'verification/scope-v8-plan-20261112.json'

def native(folder,base,trial):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import Head,setup,evaluate
 from certainty_adapter import restore
 from adapter_study import features
 from facts_v7_evaluate import prior_diagnostic
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,trial['arm']);tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 state=torch.load(folder/'best.pt',map_location='cpu',weights_only=True);head=Head(True);head.load_state_dict(state['head']);restore(model,state['adapters'])
 rows=json.loads(DATA.read_text())['splits']['calibration'];saved=trial['calibration']['predictions'];threshold=trial['selected']['threshold'];idx=[]
 for label in range(15):
  idx.append(next(i for i,r in enumerate(rows) if r['label']==label))
  candidates=[i for i,r in enumerate(rows) if r['label']==label and r.get('new_scope')]
  if candidates:idx.append(candidates[0])
 idx+=sorted(range(len(rows)),key=lambda i:abs(saved[i][1]-threshold))[:4];idx=list(dict.fromkeys(idx));subset=[rows[i] for i in idx]
 pred=evaluate(head,features(model,tok,[r['text'] for r in subset],'cpu'),subset)['predictions']
 mismatches=[rows[i]['id'] for i,(label,c) in zip(idx,pred) if (label,c>=threshold)!=(saved[i][0],saved[i][1]>=threshold)]
 diag=prior_diagnostic(model,tok,head,threshold)
 proof={'known_calibration_examples':len(idx),'cpu_gpu_decision_mismatches':mismatches,'max_confidence_delta':max(abs(c-saved[i][1]) for i,(_,c) in zip(idx,pred)),
 'old_validation':diag,'real_cpu_and_T4':True,'test_inference':False,'physical_device_tested':False}
 (folder/'native.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');del model,head;gc.collect();return proof


def qualify(trial,proof,rows):
 old=proof['old_validation'];threshold=trial['selected']['threshold']
 fallback=sum(r['label']!=14 and label==14 and p>=threshold for r,(label,p) in zip(rows,trial['calibration']['predictions']))
 checks={'calibration_and_guard_gates':trial['passed'],'old_effective_recall':old['effective']['effective_update_recall']>=.75,
 'old_corrections':old['corrections_correct']>=12,'old_false_proposals':old['metrics']['false_updates']==0,
 'native_parity':not proof['cpu_gpu_decision_mismatches'],'minimum_updates':trial['actual_steps']>=2000,
 'no_unmeasured_reference_fallback_in_calibration':fallback==0,'legacy_invariance':trial['legacy_disabled_equal']}
 return checks,fallback


def run(output,base,max_seconds=1500,mechanics=False):
 import torch
 import facts_v7_study as study
 output=Path(output);output.mkdir(parents=True,exist_ok=False);plan=json.loads(PLAN.read_text());started=time.monotonic()
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 if not mechanics and not torch.cuda.is_available():raise ValueError('Quality requires GPU')
 study.DATA=DATA;(output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');trials=[];method=None
 rows=json.loads(DATA.read_text())['splits']['calibration']
 def one(arm,seed):
  folder=output/f'{arm}-{seed}';trial=study.trial(folder,base,arm,seed,started+max_seconds,mechanics)
  if not mechanics:
   proof=native(folder,base,trial);checks,fallback=qualify(trial,proof,rows)
   trial.update(native=proof,qualification_checks=checks,qualified=all(checks.values()),unmeasured_reference_fallback=fallback)
   (folder/'result.json').write_text(json.dumps(trial,ensure_ascii=False,indent=2)+'\n')
   print('SCOPE_GATES',json.dumps({'arm':arm,'seed':seed,'checks':checks,'old_effective':proof['old_validation']['effective'],'old_corrections':proof['old_validation']['corrections_correct']}),flush=True)
  trials.append(trial);return trial
 for arm in (('flat-narrow',) if mechanics else ('flat-narrow','flat-wide')):
  if time.monotonic()-started>max_seconds-120:break
  first=one(arm,42)
  if mechanics:break
  if not first['qualified']:continue
  stable=True
  for seed in (17,73):
   if time.monotonic()-started>max_seconds-120:stable=False;break
   if not one(arm,seed)['qualified']:stable=False;break
  if stable:method=arm;break
 selected=[t for t in trials if t['arm']==method] if method else []
 result={'study':'scope-v8','trials':trials,'selected_method':method,'seconds':time.monotonic()-started,
 'qualified_for_test':not mechanics and len(selected)==3 and {t['seed'] for t in selected}=={42,17,73} and all(t['qualified'] for t in selected),
 'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False,'mechanics_only':mechanics}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--max-seconds',type=int,default=1500);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args();run(a.output,a.base,a.max_seconds,a.mechanics_only)

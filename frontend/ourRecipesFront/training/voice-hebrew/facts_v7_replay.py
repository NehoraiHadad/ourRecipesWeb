"""Controlled data follow-up: add only semantically recoverable V5 TRAIN rows.
Old validation is consumed development diagnostics, never a fresh-test claim.
"""
import argparse,gc,hashlib,json,time
from pathlib import Path
from corpus import ROOT,digest
from facts_v7 import DATA,JOINT
REPLAY=ROOT/'verification/facts-v7-replay-data-20261112.json'
PLAN=ROOT/'verification/facts-v7-replay-plan-20261112.json'
MODES={'remaining_done':('remaining','complete'),'remaining_not_done':('remaining','incomplete'),'completed_not_done':('marked','incomplete')}

def build():
 data=json.loads(DATA.read_text());old=json.loads((ROOT/'verification/certainty-v5-data-20261112/language.json').read_text())['train'];seen={r['text'] for r in data['splits']['train']};added=[];skipped=[]
 for row in old:
  if row['label'] in MODES:ref,status=MODES[row['label']];fact=(ref,'asserted',status)
  elif row['label']=='clarify' and row['group'].split(':')[1] in MODES:
   ref,status=MODES[row['group'].split(':')[1]];kind=row['kind']
   if kind=='hedge' or (kind=='metaneg' and row['text'].startswith('אין לי אישור')):fact=(ref,'uncertain',status)
   elif kind in ('future','quote','hypothesis','question','metaneg'):fact=(ref,'nonassertion','unspecified')
   else:skipped.append(row);continue
  else:skipped.append(row);continue
  if row['text'] in seen:continue
  if any(row['text']==r['text'] for split in ('dev','calibration','test') for r in data['splits'][split]):raise ValueError('Replay cross-split text')
  item={'id':'replay-'+str(len(added)),'text':row['text'],'group':'v5-'+row['group'],'label':JOINT.index(fact),'semantics':list(fact),'source_kind':row['kind'],'source_label':row['label']}
  added.append(item);seen.add(item['text'])
 data['splits']['train']+=added;data['schema']='facts-v7-replay';data['replay']={'added':len(added),'skipped_or_already_retained':len(skipped),'policy':'V5 train only; explicit labels and generated kinds. Skip legacy clarify, memory and partial-checking cases whose fact attributes are not recoverable without new annotation. No dev/calibration/test changes.'}
 return data


def native(folder,base,trial):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import Head,setup,evaluate
 from certainty_adapter import restore
 from adapter_study import features
 from facts_v7_evaluate import prior_diagnostic
 device='cpu';model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'flat-narrow');tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 state=torch.load(folder/'best.pt',map_location='cpu',weights_only=True);head=Head(True);head.load_state_dict(state['head']);restore(model,state['adapters'])
 rows=json.loads(REPLAY.read_text())['splits']['calibration'];idx=[next(i for i,r in enumerate(rows) if r['label']==k) for k in range(15)]
 subset=[rows[i] for i in idx];p=evaluate(head,features(model,tok,[r['text'] for r in subset],device),subset)['predictions'];saved=trial['calibration']['predictions'];threshold=trial['selected']['threshold']
 mismatches=sum((label,c>=threshold)!=(saved[i][0],saved[i][1]>=threshold) for i,(label,c) in zip(idx,p))
 diag=prior_diagnostic(model,tok,head,threshold)
 proof={'examples':15,'cpu_gpu_decision_mismatches':mismatches,'old_validation':diag,'test_inference':False,'physical_device_tested':False}
 (folder/'native.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');del model,head;gc.collect();return proof


def run(output,base,max_seconds=900,mechanics=False):
 import torch
 import facts_v7_study as study
 output=Path(output);output.mkdir(parents=True,exist_ok=False);plan=json.loads(PLAN.read_text());started=time.monotonic()
 for name,sha in plan['source_sha256'].items():assert digest((ROOT/name).read_bytes())==sha,name
 assert digest(REPLAY.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 if not mechanics and not torch.cuda.is_available():raise ValueError('Quality requires GPU')
 study.DATA=REPLAY;(output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');trials=[]
 for seed in ((42,) if mechanics else (42,17,73)):
  trial=study.trial(output/f'flat-narrow-{seed}',base,'flat-narrow',seed,started+max_seconds,mechanics)
  if not mechanics:
   proof=native(output/f'flat-narrow-{seed}',base,trial);old=proof['old_validation'];checks={'pilot_gates':trial['passed'],'old_effective_recall':old['effective']['effective_update_recall']>=.75,
    'old_corrections':old['corrections_correct']>=12,'old_false_proposals':old['metrics']['false_updates']==0,'native_parity':proof['cpu_gpu_decision_mismatches']==0,'minimum_steps':trial['actual_steps']>=2000}
   trial['transfer_checks']=checks;trial['transfer_passed']=all(checks.values());trial['native']=proof
   (output/f'flat-narrow-{seed}/result.json').write_text(json.dumps(trial,ensure_ascii=False,indent=2)+'\n')
   print('REPLAY_GATES',json.dumps({'seed':seed,'checks':checks,'old_effective':old['effective'],'old_corrections':old['corrections_correct']}),flush=True)
  trials.append(trial)
  if not mechanics and not trial['transfer_passed']:break
 result={'study':'facts-v7-replay','trials':trials,'seconds':time.monotonic()-started,'qualified_for_test':not mechanics and len(trials)==3 and all(t['transfer_passed'] for t in trials),
 'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False,'mechanics_only':mechanics}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output',nargs='?');p.add_argument('--base');p.add_argument('--max-seconds',type=int,default=900);p.add_argument('--mechanics-only',action='store_true');p.add_argument('--build-data',action='store_true');a=p.parse_args()
 if a.build_data:
  d=build();REPLAY.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(d['replay'],len(d['splits']['train']))
 else:run(a.output,a.base,a.max_seconds,a.mechanics_only)

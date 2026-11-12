"""Data-only replay pilot; unchanged V9 trainer and fixed guarded decoder."""
import argparse,hashlib,json,time
from pathlib import Path
import torch
from corpus import ROOT,digest
import scope_v9 as parent
from scope_v9_guarded_train import evaluate_seed
from scope_v11_data import DATA
PLAN=ROOT/'verification/scope-v11-replay-plan-20261112.json'


def run(output,base,max_seconds=2700,mechanics=False):
 plan=json.loads(PLAN.read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 if not mechanics and not torch.cuda.is_available():raise ValueError('Actual GPU required')
 start=time.monotonic();output=Path(output);output.mkdir(parents=True,exist_ok=False);(output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');trials=[]
 parent.DATA=DATA  # Only data input changes; original training source remains frozen.
 for seed in ((42,) if mechanics else (42,17,73)):
  if not mechanics and time.monotonic()-start>max_seconds-720:break
  t=parent.trial(output/f'parent-seed-{seed}',base,seed,start+max_seconds,mechanics)
  if mechanics:trials.append(t);break
  # evaluate_seed uses the unchanged493 calibration rows. Parent and new held
  # splits are asserted identical by the data audit; calibration policy is from t.
  v=evaluate_seed(output/f'seed-{seed}',base,seed,t,output/f'parent-seed-{seed}/semantic-best.pt');trials.append(v)
  (output/'partial.json').write_text(json.dumps({'trials':trials,'qualified_for_test':False},ensure_ascii=False)+'\n')
  if not v['qualified']:break
 result={'study':'scope-v11-replay','trials':trials,'qualified_for_test':not mechanics and len(trials)==3 and all(t['qualified'] for t in trials),'seconds':time.monotonic()-start,'mechanics_only':mechanics,'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--max-seconds',type=int,default=2700);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args();run(a.output,a.base,a.max_seconds,a.mechanics_only)

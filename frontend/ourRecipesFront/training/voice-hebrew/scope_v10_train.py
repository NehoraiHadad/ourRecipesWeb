"""Train only the predeclared third consensus member, without changing V9."""
import argparse,hashlib,json,time
from pathlib import Path
import torch
from corpus import ROOT,digest
from scope_v9 import trial,run as mechanics_run
from scope_v9_guarded_train import evaluate_seed
from scope_v9_data import DATA
PLAN=ROOT/'verification/scope-v10-prospective-plan-20261112.json'


def run(output,base,max_seconds=1200,mechanics=False):
 plan=json.loads(PLAN.read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 if mechanics:return mechanics_run(output,base,max_seconds,True)
 if not torch.cuda.is_available():raise ValueError('Actual GPU required')
 start=time.monotonic();output=Path(output);output.mkdir(parents=True,exist_ok=False)
 (output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
 parent=trial(output/'parent-seed-73',base,73,start+max_seconds)
 member=evaluate_seed(output/'seed-73',base,73,parent,output/'parent-seed-73/semantic-best.pt')
 result={'study':'scope-v10-third-member','trials':[member],'seconds':time.monotonic()-start,'qualified_for_test':False,'note':'Individual result preserved; only fixed ALL-three consensus may qualify in a separate evaluator.','new_test_inference':False}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--max-seconds',type=int,default=1200);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args();run(a.output,a.base,a.max_seconds,a.mechanics_only)

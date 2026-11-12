"""Actual CPU timing of fixed three-pass consensus, independent of quality gates."""
import argparse,json,math,statistics,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v10_evaluate import members,verify
from scope_v10_train import PLAN
from scope_v10_consensus import consensus
from scope_v9_hierarchy import raw
from scope_v9_data import DATA
from facts_v7 import apply,JOINT,context


def run(oldroot,newroot,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 torch.set_num_threads(2);start=time.perf_counter();items=members(oldroot,newroot);verify(json.loads(PLAN.read_text()),base,items)
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 states=[torch.load(p,weights_only=True,map_location='cpu') for p,t in items];policies=[t['policy'] for p,t in items];load_seconds=time.perf_counter()-start
 rows=json.loads(DATA.read_text())['splits']['calibration'];sample=[]
 for label in range(15):sample += [r for r in rows if r['label']==label][:2]
 latencies=[];parts=[];bound_state=context('remaining','unique-a')
 for n,row in enumerate(sample[:3]+sample):
  start=time.perf_counter();votes=[];member_times=[]
  for state in states:
   ts=time.perf_counter();head.load_state_dict(state['head']);restore(model,state['adapters']);votes.append(raw(model,tok,head,[row['text']])[0]);member_times.append(time.perf_counter()-ts)
  kind,label=consensus(votes,policies)
  if kind=='reference':apply(JOINT[label],bound_state,bound_state['recipe_id'],'v1')
  elapsed=time.perf_counter()-start
  if n>=3:latencies.append(elapsed);parts.append(member_times)
 rss={}
 for line in Path('/proc/self/status').read_text().splitlines():
  if line.startswith(('VmRSS:','VmHWM:')):key,value,*_=line.split();rss[key.rstrip(':')]=int(value)*1024
 proof={'scope':'Actual x86 cloud CPU FP32,2Torch threads. Single shared735MB body,3 resident adapter/head payloads. Includes per-turn parameter validation/copy, tokenization,three encoder/head passes,consensus and fixed4-action state binding. Excludes live legacy fallback,audio,download,ONNX/browser and phone performance. No cold-cache guarantee.','seed_order':[42,17,73],'load_seconds':load_seconds,'warmup_turns':3,'measured_turns':len(latencies),'median_seconds':statistics.median(latencies),'p95_seconds':sorted(latencies)[math.ceil(.95*len(latencies))-1],'rss_bytes':rss,'checkpoint_bytes':[p.stat().st_size for p,t in items],'checkpoint_sha256':[t['checkpoint_sha256'] for p,t in items],'raw_seconds':latencies,'member_seconds':parts,'physical_device_tested':False,'test_inference':False}
 (ROOT/'verification/scope-v10-consensus-benchmark-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k not in ('raw_seconds','member_seconds')},indent=2));return proof


if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('oldroot');p.add_argument('newroot');p.add_argument('--base',required=True);a=p.parse_args();run(a.oldroot,a.newroot,a.base)

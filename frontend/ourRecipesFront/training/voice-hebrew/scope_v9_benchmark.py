"""Known-calibration CPU reference branch only, no audio/phone/live fallback.
Run only after three-seed method qualification. Does not select weights.
"""
import argparse,json,resource,statistics,time
from pathlib import Path
from corpus import ROOT,digest
from scope_v9_test import candidates
from scope_v9_data import DATA
from scope_v9 import accept
from facts_v7 import JOINT,context,apply

def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from adapter_study import features
 from certainty_adapter import restore
 torch.set_num_threads(2);study=Path(root)/'recovered/study';method,trials=candidates(json.loads((study/'result.json').read_text()));trial=next(t for t in trials if t['seed']==42);v=trial['variants'][method];checkpoint=study/'seed-42'/v['checkpoint'];load_start=time.perf_counter()
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(checkpoint,weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);head.eval();tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 load_seconds=time.perf_counter()-load_start;rows=json.loads(DATA.read_text())['splits']['calibration'];sample=[]
 for label in range(15):sample += [r for r in rows if r['label']==label][:2]
 state=context('remaining','unique-a');latencies=[]
 for i,row in enumerate(sample[:3]+sample):
  start=time.perf_counter();x=features(model,tok,[row['text']],'cpu')
  with torch.no_grad():p,k=head.logprobs(x).exp().max(-1)
  pred=(int(k),float(p));bound=apply(JOINT[pred[0]],state,state['recipe_id'],'v1') if accept(pred,v['calibration']) else {'kind':'clarify','changes':[]}
  elapsed=time.perf_counter()-start
  if i>=3:latencies.append(elapsed)
 rss={}
 for line in Path('/proc/self/status').read_text().splitlines():
  if line.startswith(('VmRSS:','VmHWM:')):key,value,*_=line.split();rss[key.rstrip(':')]=int(value)*1024
 ordered=sorted(latencies);proof={'scope':'Actual x86 cloud CPU, FP32,2Torch threads. Tokenization+reference BERT/head+policy+fixed4-action binding. Excludes live legacy extraction, audio,download and phone/browser performance.3warmups then30known synthetic calibration texts, one pass,no cold-file-cache guarantee.',
 'method':method,'seed':42,'checkpoint_sha256':digest(checkpoint.read_bytes()),'load_seconds':load_seconds,'measured_turns':len(latencies),'median_seconds':statistics.median(latencies),'p95_seconds':ordered[max(0,__import__('math').ceil(.95*len(ordered))-1)],'min_seconds':min(latencies),'max_seconds':max(latencies),'rss_bytes':rss,'raw_seconds':latencies,'physical_device_tested':False,'test_inference':False}
 (ROOT/'verification/scope-v9-benchmark-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

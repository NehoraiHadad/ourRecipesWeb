"""Append-only experiment events; large tensors and credentials stay out of logs."""
import datetime,json,platform,subprocess,sys
from pathlib import Path
from corpus import ROOT,digest
RUN=ROOT/'runs/scope-v13-stance'


def event(stage,**fields):
 record={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stage':stage,**fields}
 with (RUN/'events.jsonl').open('a') as f:f.write(json.dumps(record,ensure_ascii=False)+'\n')
 print(json.dumps(record,ensure_ascii=False),flush=True)
 return record


def environment():
 import torch,transformers,numpy
 return {'python':sys.version,'torch':torch.__version__,'transformers':transformers.__version__,'numpy':numpy.__version__,'machine':platform.machine(),'platform':platform.platform(),'torch_threads':torch.get_num_threads(),'git_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}

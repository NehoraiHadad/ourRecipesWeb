"""Native CPU scoring of the separately frozen alias diagnostic; no selection."""
import argparse
import hashlib
import json
from pathlib import Path
import time
from combined_probe import build,fingerprint
from corpus import ROOT
from semantic_sweep import evaluate_path


def evaluate(run,output,role):
    import torch
    torch.set_num_threads(4);run=Path(run)
    if not (run.parent/'selection-frozen.json').exists():raise ValueError('Require an already-selected checkpoint')
    plan=json.loads((ROOT/'verification/combined-probe-plan-20261111.json').read_text())
    if plan['sha256']!=fingerprint()['sha256']:raise ValueError('Probe data changed')
    recs,rows=build();started=time.monotonic()
    metrics=evaluate_path(run,recs,rows,'cpu',time.monotonic()+180)
    elapsed=time.monotonic()-started
    with (run/'model/model.safetensors').open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
    result={'role':role,'provenance':fingerprint(),'engine':'Actual native CPU, no model or threshold selection',
        'seconds_including_model_load':elapsed,'weights_sha256':sha,'config':json.loads((run/'run-config.json').read_text()),'metrics':metrics}
    Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in metrics.items() if k not in ['cases','by_scenario']},indent=2));return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run');p.add_argument('output');p.add_argument('--role',default='selected-new-checkpoint');a=p.parse_args();evaluate(a.run,a.output,a.role)

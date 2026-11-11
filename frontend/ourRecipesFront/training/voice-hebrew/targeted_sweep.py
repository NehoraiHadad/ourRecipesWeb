"""Two bounded interventions, one selected candidate; no test-driven selection."""
import argparse
import gc
import json
from pathlib import Path
import shutil
import time
from corpus import ROOT, digest, load_data
from span_pilot import run as train, encode, infer, grounded


def compact(metrics):return {k:v for k,v in metrics.items() if k not in ['cases','by_scenario']}


def selection_key(variant):
    m=variant['report']['validation_0_5']
    return (int(m['update_recall']>=.88),m['update_precision'] or 0,m['exact_including_gold_evidence'],m['update_recall'])


def run(output, steps=1500, max_seconds=800, device='cuda'):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    deadline=time.monotonic()+max_seconds;variants=[]
    for name,profile,limit in [('control','span-v1',min(1000,steps)),('targeted','joint-contrast-v2',steps)]:
        remaining=int(deadline-time.monotonic())
        if remaining<80:raise TimeoutError('Insufficient bounded comparison budget')
        root=output/'ablations'/name
        report=train(root,steps=limit,max_seconds=min(410,remaining-40),device=device,
                     model_choice='base' if device=='cuda' else 'tiny',train_only=True,profile=profile,eval_every=250)
        config=json.loads((root/'run/run-config.json').read_text())
        variants.append({'name':name,'profile':profile,'report':report,'config':config,
            'learning_curve':json.loads((root/'run/learning-curve.json').read_text()) if (root/'run/learning-curve.json').exists() else []})
        gc.collect()
        if device=='cuda':torch.cuda.empty_cache()
        (output/'targeted-progress.json').write_text(json.dumps(variants,ensure_ascii=False,indent=2)+'\n')
    selected=max(variants,key=selection_key);source=output/'ablations'/selected['name']
    # Copy only inference/training weights and selected reports. The best weights
    # are already restored in run/model; the duplicate checkpoint stays remote.
    shutil.copytree(source/'run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'))
    shutil.copytree(source/'selected-data',output/'selected-data')
    metrics=selected['report']['validation_0_5'];control=variants[0]['report']['validation_0_5']
    progress=(metrics['false_updates']<=control['false_updates']-3 and
              metrics['update_recall']>=control['update_recall']-.04 and
              (metrics['update_precision'] or 0)>=.95)
    result={'scope':'Synthetic single-seed engineering comparison; not causal isolation of data vs loss',
        'variants':variants,'selected_variant':selected['name'],'selection':'Validation only; prefer recall >=88%, then action precision, grounded exact and recall',
        'material_progress_over_control':progress,'test_evaluated':False,'production_ready':False,
        'source_sha256':{name:digest((ROOT/name).read_bytes()) for name in ['span_pilot.py','targeted_data.py','targeted_sweep.py']}}
    (output/'targeted-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    # Regression evaluation only, strictly after variant/checkpoint selection.
    from challenge import challenge
    recs,rows=challenge();config=selected['config']
    model=AutoModelForTokenClassification.from_pretrained(output/'run/model',local_files_only=True,attn_implementation='eager').to(device)
    tokenizer=AutoTokenizer.from_pretrained(output/'run/model',local_files_only=True)
    items=[x for row in rows for x in encode(tokenizer,recs[row['recipe_id']],row,config.get('span_profile','span-v1'))]
    records=infer(model,tokenizer,items,device,deadline)
    regression=grounded(rows,records,.5)
    (output/'run/regression-0.5.json').write_text(json.dumps(regression,ensure_ascii=False,indent=2)+'\n')
    result['regression_0_5']=compact(regression)
    from fresh_diagnostic import build,fingerprint
    fr,frows=build();fi=[x for row in frows for x in encode(tokenizer,fr[row['recipe_id']],row,config.get('span_profile','span-v1'))]
    fresh=grounded(frows,infer(model,tokenizer,fi,device,deadline),.5)
    (output/'run/fresh-diagnostic-0.5.json').write_text(json.dumps({'provenance':fingerprint(),'metrics':fresh},ensure_ascii=False,indent=2)+'\n')
    result['fresh_diagnostic_0_5']={'provenance':fingerprint(),'metrics':compact(fresh)}
    (output/'targeted-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selected':selected['name'],'metrics':metrics,'material_progress':progress},indent=2),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=1500);p.add_argument('--max-seconds',type=int,default=800);p.add_argument('--cpu-smoke',action='store_true')
    a=p.parse_args()
    if not 1<=a.steps<=1500 or not 120<=a.max_seconds<=900:raise SystemExit('Invalid comparison bounds')
    run(a.output,a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda')

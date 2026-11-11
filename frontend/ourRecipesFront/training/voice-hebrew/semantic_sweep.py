"""Three isolated arms, two fixed seeds, validation selection then frozen test."""
import argparse
import gc
import json
from pathlib import Path
import shutil
import statistics
import time
from corpus import ROOT, digest, load_data
from semantic_data import build
from span_pilot import run as train, encode, infer, grounded

ARMS=[('control','control','context-span-v3'),('data_only','richer','context-span-v3'),
      ('loss_only','control','context-joint-v3')]
SEEDS=[42,17]


def compact(m):return {k:v for k,v in m.items() if k not in ['cases']}


def fbeta(m):
    p=m['update_precision'] or 0;r=m['update_recall']
    return 1.25*p*r/(.25*p+r) if p+r else 0


def aggregate(variants):
    result={}
    for arm,_,_ in ARMS:
        members=[v['report']['validation_0_5'] for v in variants if v['arm']==arm]
        result[arm]={'seeds':len(members),'minimum_recall':min(m['update_recall'] for m in members),
            'mean_precision':statistics.mean(m['update_precision'] or 0 for m in members),
            'mean_recall':statistics.mean(m['update_recall'] for m in members),
            'mean_f0_5':statistics.mean(fbeta(m) for m in members),
            'mean_state_exact':statistics.mean(m['exact_rate'] for m in members),
            'mean_quote_exact':statistics.mean(m['exact_including_gold_evidence']/m['examples'] for m in members)}
    return result


def selection_key(m):return (m['minimum_recall']>=.7,m['mean_f0_5'],m['mean_state_exact'],m['mean_quote_exact'])


def evaluate_path(run,recs,rows,device,deadline):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    cfg=json.loads((run/'run-config.json').read_text())
    model=AutoModelForTokenClassification.from_pretrained(run/'model',local_files_only=True,attn_implementation='eager').to(device)
    tokenizer=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    items=[x for row in rows for x in encode(tokenizer,recs[row['recipe_id']],row,cfg['span_profile'])]
    metrics=grounded(rows,infer(model,tokenizer,items,device,deadline),.5)
    del model;gc.collect()
    if device=='cuda':torch.cuda.empty_cache()
    return metrics


def run(output,steps=1000,max_seconds=1600,device='cuda'):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    deadline=time.monotonic()+max_seconds
    control,richer,audit=build(output/'comparison-data');variants=[]
    for seed in SEEDS:
        for arm,data,profile in ARMS:
            remaining=int(deadline-time.monotonic())
            if remaining<110:raise TimeoutError('Insufficient comparison budget; do not silently skip an arm/seed')
            folder=output/'ablations'/f'{arm}-{seed}'
            print(json.dumps({'arm':arm,'seed':seed,'phase':'train'}),flush=True)
            report=train(folder,steps=steps,max_seconds=min(300,remaining-60),device=device,
                model_choice='base' if device=='cuda' else 'tiny',train_only=True,profile=profile,
                eval_every=250,data_source=control if data=='control' else richer,seed=seed)
            config=json.loads((folder/'run/run-config.json').read_text())
            variants.append({'arm':arm,'seed':seed,'profile':profile,'report':report,'config':config,
                'learning_curve':json.loads((folder/'run/learning-curve.json').read_text()) if (folder/'run/learning-curve.json').exists() else []})
            (output/'semantic-progress.json').write_text(json.dumps(variants,ensure_ascii=False,indent=2)+'\n')
            gc.collect()
            if device=='cuda':torch.cuda.empty_cache()
    means=aggregate(variants);winner=max(means,key=lambda k:selection_key(means[k]))
    frozen={'selected_arm':winner,'retained_seed':42,'aggregate_validation':means,'threshold':.5,
            'test_used_for_selection':False,'selection':'minimum seed recall >=70% preferred; mean F0.5, state exact, quote exact; fixed seed42 retained, no best-seed shopping'}
    (output/'selection-frozen.json').write_text(json.dumps(frozen,indent=2)+'\n')
    source=output/'ablations'/f'{winner}-42'
    shutil.copytree(source/'run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'))
    shutil.copytree(source/'selected-data',output/'selected-data')
    result={'scope':'Synthetic model-only comparison; common context3 input; isolated data or loss changes, two fixed seeds',
        **frozen,'variants':variants,'data_audit':audit,'human_reviewed':False,'production_ready':False,
        'source_sha256':{n:digest((ROOT/n).read_bytes()) for n in ['corpus.py','span_pilot.py','semantic_data.py','semantic_sweep.py']}}
    # Publish the immutable validation decision before any new test scoring.
    (output/'semantic-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    recs,rows=load_data(control);test=[r for r in rows if r['split']=='test']
    test_reports=[]
    for variant in variants:
        folder=output/'ablations'/f'{variant["arm"]}-{variant["seed"]}'/'run'
        metrics=evaluate_path(folder,recs,test,device,deadline)
        (folder/'new-test-once.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
        test_reports.append({'arm':variant['arm'],'seed':variant['seed'],'metrics':compact(metrics)})
    result['new_test_once']=test_reports
    # Historical validation and prior challenge sets are regression only now.
    from challenge import challenge
    from fresh_diagnostic import build as old_fresh
    oldrecs,oldrows=load_data()
    regressions=[('historical-validation',oldrecs,[r for r in oldrows if r['split']=='validation']),
                 ('regression68',*challenge()),('regression16',*old_fresh())]
    result['selected_regressions']={}
    for name,recs,rows in regressions:
        metrics=evaluate_path(output/'run',recs,rows,device,deadline)
        (output/'run'/f'{name}.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
        result['selected_regressions'][name]=compact(metrics)
    # Require improvement in BOTH fixed seeds, not only the average.
    by={(v['arm'],v['seed']):v['report']['validation_0_5'] for v in variants}
    result['repeatable_validation_progress']={arm:all(
        fbeta(by[arm,s])>=fbeta(by['control',s])+.05 and
        (by[arm,s]['update_precision'] or 0)>=(by['control',s]['update_precision'] or 0)
        for s in SEEDS) for arm,_,_ in ARMS if arm!='control'}
    result['original_test_scored']=False
    (output/'data-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    (output/'semantic-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'winner':winner,'validation':means,'new_test':[{'arm':r['arm'],'seed':r['seed'],**{k:v for k,v in r['metrics'].items() if k!='by_scenario'}} for r in test_reports]},indent=2),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=1000);p.add_argument('--max-seconds',type=int,default=1600);p.add_argument('--cpu-smoke',action='store_true');a=p.parse_args()
    if not 1<=a.steps<=1000 or not 120<=a.max_seconds<=1700:raise SystemExit('Invalid semantic comparison bounds')
    run(a.output,a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda')

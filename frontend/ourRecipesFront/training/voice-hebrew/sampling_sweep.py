"""V10 isolated sampling / same-report margin comparison, two fixed seeds."""
import argparse
import gc
import json
from pathlib import Path
import shutil
import statistics
import time
from corpus import ROOT,digest,load_data
from sampling_data import build
from span_pilot import run as train
from semantic_sweep import compact,evaluate_path,fbeta

ARMS=[('control','balanced-task',0.),('sample','paired-family',0.),('contrast','paired-family',.2)]
SEEDS=[42,17]


def choose(variants):
    by={(v['arm'],v['seed']):v['report']['validation_0_5'] for v in variants}
    aggregate={}
    for arm,_,_ in ARMS:
        ms=[by[arm,seed] for seed in SEEDS]
        aggregate[arm]={'mean_f0_5':statistics.mean(fbeta(m) for m in ms),'minimum_seed_f0_5':min(fbeta(m) for m in ms),
            'mean_precision':statistics.mean(m['update_precision'] or 0 for m in ms),
            'mean_recall':statistics.mean(m['update_recall'] for m in ms),
            'mean_state_exact':statistics.mean(m['exact_rate'] for m in ms)}
    eligible=['control']
    for arm in ('sample','contrast'):
        preserves=all((by[arm,s]['update_precision'] or 0)>=(by['control',s]['update_precision'] or 0)-.01
                      and by[arm,s]['update_recall']>=by['control',s]['update_recall']-.02 for s in SEEDS)
        if preserves and aggregate[arm]['mean_f0_5']>aggregate['control']['mean_f0_5']:eligible.append(arm)
    winner=max(eligible,key=lambda arm:(aggregate[arm]['minimum_seed_f0_5'],aggregate[arm]['mean_f0_5'],aggregate[arm]['mean_precision'],aggregate[arm]['mean_state_exact']))
    return {'selected_arm':winner,'retained_seed':42,'aggregate_validation':aggregate,'eligible_arms':eligible,
        'threshold':.5,'new_test_used_for_selection':False,
        'selection':'Validation only: candidates must preserve each matched-control precision within1pp and recall within2pp, improve meanF0.5; maximize worst-seedF0.5 then meanF0.5/precision/state exact; fixed42 primary,17 supplemental'}


def run(output,steps=1000,max_seconds=2400,device='cuda'):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=True);deadline=time.monotonic()+max_seconds
    data,audit=build(output/'comparison-data');variants=[]
    for seed in SEEDS:
        for arm,regime,weight in ARMS:
            left=int(deadline-time.monotonic())
            if left<150:raise TimeoutError('Do not silently omit a predeclared arm/seed')
            folder=output/'ablations'/f'{arm}-{seed}'
            print(json.dumps({'arm':arm,'seed':seed,'phase':'train'}),flush=True)
            report=train(folder,steps=steps,max_seconds=min(420,left-100),device=device,
                model_choice='base' if device=='cuda' else 'tiny',train_only=True,profile='context-joint-v3',
                eval_every=250,data_source=data,seed=seed,checkpoint_objective='f0.5',
                regime=regime,contrast_weight=weight,checkpoint_io='best-only')
            variants.append({'arm':arm,'seed':seed,'report':report,
                'config':json.loads((folder/'run/run-config.json').read_text())})
            (output/'sampling-progress.json').write_text(json.dumps(variants,ensure_ascii=False,indent=2)+'\n')
            gc.collect()
            if device=='cuda':torch.cuda.empty_cache()
    frozen=choose(variants)
    (output/'selection-frozen.json').write_text(json.dumps(frozen,indent=2)+'\n')
    source=output/'ablations'/f'{frozen["selected_arm"]}-42'
    shutil.copytree(source/'run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'))
    shutil.copytree(source/'selected-data',output/'selected-data')
    result={**frozen,'study':'sampling-v10','variants':variants,'data_audit':audit,
        'scope':'Six real T4 trials' if device=='cuda' else 'Six two-step tiny CPU mechanics trials; no new-test inference or quality claim',
        'human_reviewed':False,'physical_device_tested':False,'production_ready':False,
        'source_sha256':{n:digest((ROOT/n).read_bytes()) for n in ['paired_sampling.py','sampling_data.py','sampling_sweep.py','span_pilot.py','corpus.py','engine.py']}}
    (output/'sampling-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    if device=='cpu':
        result['new_test_evaluated']=False
        (output/'sampling-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result
    recs,rows=load_data(data);test=[r for r in rows if r['split']=='test'];result['new_test_once']=[]
    for v in variants:
        folder=output/'ablations'/f'{v["arm"]}-{v["seed"]}'/'run'
        metrics=evaluate_path(folder,recs,test,device,deadline)
        (folder/'new-test-once.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
        result['new_test_once'].append({'arm':v['arm'],'seed':v['seed'],'metrics':compact(metrics)})
    from focused_data import authored
    from combined_data import holdouts
    from combined_probe import build as probe
    from challenge import challenge
    vr,vx=authored();br,bx=holdouts()
    regressions=[('prior-focused-test',vr,[r for r in vx if r['split']=='test']),
        ('prior-combined-test',br,[r for r in bx if r['split']=='test']),('known-probe16',*probe()),('regression68',*challenge())]
    result['selected_regressions']={}
    for seed in SEEDS:
        folder=output/'ablations'/f'{frozen["selected_arm"]}-{seed}'/'run';result['selected_regressions'][str(seed)]={}
        for name,recs,rows in regressions:
            metrics=evaluate_path(folder,recs,rows,device,deadline)
            (folder/f'{name}.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
            result['selected_regressions'][str(seed)][name]=compact(metrics)
    result['new_test_evaluated']=True;result['original_test_scored']=False
    (output/'sampling-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selection':frozen,'new_test':result['new_test_once']},ensure_ascii=False,indent=2),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=1000);p.add_argument('--max-seconds',type=int,default=2400);p.add_argument('--cpu-smoke',action='store_true');a=p.parse_args()
    if not 1<=a.steps<=1000 or not 120<=a.max_seconds<=2400:raise SystemExit('Invalid V10 bounds')
    run(a.output,a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda')

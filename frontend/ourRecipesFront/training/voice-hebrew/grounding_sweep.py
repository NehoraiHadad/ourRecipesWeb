"""V11 evidence-boundary ablation; unchanged training data and action context."""
import argparse
import gc
import json
from pathlib import Path
import shutil
import statistics
import time
from corpus import ROOT,digest,load_data
from grounding_data import build
from research_decision import cost,MIN_RECALL
from span_pilot import run as train,encode,infer,grounded

ARMS=[('control','context-joint-v3'),('boundary','context-qa-v4')]
SEEDS=[42,17]


def compact(m):return {k:v for k,v in m.items() if k not in ('cases','by_scenario')}


def choose(variants):
    by={(v['arm'],v['seed']):v['report']['validation_research'] for v in variants}
    aggregate={}
    for arm,_ in ARMS:
        ms=[by[arm,s] for s in SEEDS]
        aggregate[arm]={'mean_cost':statistics.mean(cost(m) for m in ms),'worst_cost':max(cost(m) for m in ms),
            'mean_precision':statistics.mean(m['update_precision'] or 0 for m in ms),
            'minimum_recall':min(m['update_recall'] for m in ms)}
    eligible=(all(by['boundary',s]['update_recall']>=MIN_RECALL for s in SEEDS)
        and aggregate['boundary']['mean_cost']<aggregate['control']['mean_cost']
        and aggregate['boundary']['worst_cost']<=aggregate['control']['worst_cost'])
    return {'selected_arm':'boundary' if eligible else 'control','retained_seed':42,
        'aggregate_validation':aggregate,'boundary_eligible':eligible,'new_test_used_for_selection':False,
        'selection':'Validation only: boundary must have recall>=.75 in both seeds, lower mean cost and no higher worst-seed cost than control; otherwise control. Cost=5*false+missed. Fixed42 primary,17 supplemental.'}


def evaluate(run,recs,rows,device,deadline):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    cfg=json.loads((run/'run-config.json').read_text());decision=json.loads((run/'research-decision.json').read_text())
    model=AutoModelForTokenClassification.from_pretrained(run/'model',local_files_only=True,attn_implementation='eager').to(device)
    tok=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    items=[i for row in rows for i in encode(tok,recs[row['recipe_id']],row,cfg['span_profile'])]
    metrics=grounded(rows,infer(model,tok,items,device,deadline),decision['threshold'])
    del model;gc.collect()
    if device=='cuda':torch.cuda.empty_cache()
    return metrics


def run(output,steps=1000,max_seconds=2100,device='cuda'):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=True);deadline=time.monotonic()+max_seconds
    data,audit=build(output/'comparison-data');variants=[]
    frozen_data=json.loads((ROOT/'verification/grounding-data-freeze-20261112.json').read_text())
    manifest=json.loads((data/'manifest.json').read_text())
    if manifest['corpus_sha256']!=frozen_data['corpus_sha256'] or audit['training_rows_sha256']!=frozen_data['training_rows_sha256']:
        raise ValueError('Dataset differs from the pre-training freeze')
    for seed in SEEDS:
        for arm,profile in ARMS:
            left=int(deadline-time.monotonic())
            if left<150:raise TimeoutError('Do not silently omit a frozen arm/seed')
            folder=output/'ablations'/f'{arm}-{seed}'
            print(json.dumps({'arm':arm,'seed':seed,'phase':'train'}),flush=True)
            report=train(folder,steps=steps,max_seconds=min(480,left-100),device=device,
                model_choice='base' if device=='cuda' else 'tiny',train_only=True,profile=profile,
                eval_every=250,data_source=data,seed=seed,checkpoint_objective='cost5',
                regime='paired-family',contrast_weight=.2,checkpoint_io='best-only',shared_head_init=True)
            variants.append({'arm':arm,'seed':seed,'report':report,
                'config':json.loads((folder/'run/run-config.json').read_text())})
            (output/'grounding-progress.json').write_text(json.dumps(variants,ensure_ascii=False,indent=2)+'\n')
            gc.collect()
            if device=='cuda':torch.cuda.empty_cache()
    for seed in SEEDS:
        hashes=[v['config']['initial_shared_head_sha256'] for v in variants if v['seed']==seed]
        if len(set(hashes))!=1:raise RuntimeError('Shared candidate/intent initialization mismatch')
    frozen=choose(variants)
    (output/'selection-frozen.json').write_text(json.dumps(frozen,indent=2)+'\n')
    (output/'artifact-retention.json').write_text(json.dumps({'arms':['control','boundary'],'seeds':SEEDS,'role':'Keep all four research checkpoints; root run is validation-selected42'},indent=2)+'\n')
    source=output/'ablations'/f'{frozen["selected_arm"]}-42'
    shutil.copytree(source/'run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'))
    shutil.copytree(source/'selected-data',output/'selected-data')
    result={**frozen,'study':'grounding-v11','variants':variants,'data_audit':audit,
        'scope':'Four real T4 trials' if device=='cuda' else 'Four two-step tiny CPU mechanics trials; no fresh-test inference or quality claim',
        'human_reviewed':False,'physical_device_tested':False,'production_ready':False,
        'source_sha256':{n:digest((ROOT/n).read_bytes()) for n in ['grounding_sweep.py','boundary_head.py','research_decision.py','grounding_data.py','span_pilot.py','paired_sampling.py','head_trace.py','engine.py','corpus.py']}}
    def save():
        (output/'grounding-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    save()
    if device=='cpu':result['new_test_evaluated']=False;save();return result
    recs,rows=load_data(data);valid=[r for r in rows if r['split']=='validation'];test=[r for r in rows if r['split']=='test']
    result['new_test_once']=[];result['validation_heads']=[]
    from head_trace import run as trace
    for v in variants:
        folder=output/'ablations'/f'{v["arm"]}-{v["seed"]}'/'run'
        threshold=json.loads((folder/'research-decision.json').read_text())['threshold']
        heads=trace(folder,recs,valid,device,folder/'head-trace-validation.json',deadline,threshold=threshold)
        result['validation_heads'].append({'arm':v['arm'],'seed':v['seed'],**{k:x for k,x in heads.items() if k!='cases'}})
        metrics=evaluate(folder,recs,test,device,deadline)
        (folder/'new-test-once.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
        result['new_test_once'].append({'arm':v['arm'],'seed':v['seed'],'metrics':compact(metrics)})
        save()
    from combined_probe import build as probe
    from sampling_data import heldouts as fresh_holdouts
    # Consumed V10 data is regression-only. Original120 remains unscored.
    oldr,oldx=fresh_holdouts()
    regressions=[('known-probe16',*probe()),('consumed-v10-test',oldr,[r for r in oldx if r['split']=='test'])]
    result['selected_regressions']={}
    for seed in SEEDS:
        folder=output/'ablations'/f'{frozen["selected_arm"]}-{seed}'/'run';result['selected_regressions'][str(seed)]={}
        for name,rr,xx in regressions:
            metrics=evaluate(folder,rr,xx,device,deadline)
            (folder/f'{name}.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
            result['selected_regressions'][str(seed)][name]=compact(metrics)
    result['new_test_evaluated']=True;result['original_test_scored']=False;save()
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=1000);p.add_argument('--max-seconds',type=int,default=2100);p.add_argument('--cpu-smoke',action='store_true');a=p.parse_args()
    if not 1<=a.steps<=1000 or not 120<=a.max_seconds<=2400:raise SystemExit('Invalid V11 bounds')
    run(a.output,a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda')

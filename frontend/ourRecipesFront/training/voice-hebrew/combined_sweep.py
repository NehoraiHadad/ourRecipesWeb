"""Bounded combined-data + joint-supervision study, with matched joint control."""
import argparse
import gc
import json
from pathlib import Path
import shutil
import statistics
import time
from corpus import ROOT,digest,load_data
from combined_data import build
from semantic_sweep import evaluate_path,fbeta,compact
from span_pilot import run as train

SEEDS=[42,17]


def run(output,steps=1500,max_seconds=1700,device='cuda'):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    deadline=time.monotonic()+max_seconds
    control,combined,audit=build(output/'comparison-data');variants=[]
    for seed in SEEDS:
        for arm,data in [('control',control),('combined',combined)]:
            left=int(deadline-time.monotonic())
            if left<130:raise TimeoutError('Insufficient budget; do not silently omit an arm')
            folder=output/'ablations'/f'{arm}-{seed}'
            print(json.dumps({'arm':arm,'seed':seed,'phase':'train'}),flush=True)
            report=train(folder,steps=steps,max_seconds=min(420,left-90),device=device,
                model_choice='base' if device=='cuda' else 'tiny',train_only=True,
                profile='context-joint-v3',eval_every=250,data_source=data,seed=seed,checkpoint_objective='f0.5')
            variants.append({'arm':arm,'seed':seed,'report':report,
                'config':json.loads((folder/'run/run-config.json').read_text()),
                'learning_curve':json.loads((folder/'run/learning-curve.json').read_text()) if (folder/'run/learning-curve.json').exists() else []})
            (output/'combined-progress.json').write_text(json.dumps(variants,ensure_ascii=False,indent=2)+'\n')
            gc.collect()
            if device=='cuda':torch.cuda.empty_cache()
    means={}
    for arm in ['control','combined']:
        members=[v['report']['validation_0_5'] for v in variants if v['arm']==arm]
        means[arm]={'mean_f0_5':statistics.mean(fbeta(m) for m in members),
            'mean_precision':statistics.mean(m['update_precision'] or 0 for m in members),
            'mean_recall':statistics.mean(m['update_recall'] for m in members),
            'mean_state_exact':statistics.mean(m['exact_rate'] for m in members)}
    winner=max(means,key=lambda a:(means[a]['mean_f0_5'],means[a]['mean_precision'],means[a]['mean_state_exact']))
    frozen={'selected_arm':winner,'retained_seed':42,'aggregate_validation':means,'threshold':.5,
        'selection':'Validation only: mean F0.5, then precision and state exact. Fixed seed42 retained. Shared F0.5 checkpoint objective.',
        'new_test_used_for_selection':False}
    (output/'selection-frozen.json').write_text(json.dumps(frozen,indent=2)+'\n')
    source=output/'ablations'/f'{winner}-42'
    shutil.copytree(source/'run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'))
    shutil.copytree(source/'selected-data',output/'selected-data')
    result={**frozen,'scope':'Four actual model-only trials' if device=='cuda' else 'Four two-step tiny CPU mechanics trials; no quality claim',
        'variants':variants,'data_audit':audit,'human_reviewed':False,'production_ready':False,
        'source_sha256':{n:digest((ROOT/n).read_bytes()) for n in ['combined_data.py','combined_sweep.py','span_pilot.py','corpus.py']}}
    (output/'combined-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    recs,rows=load_data(control);test=[r for r in rows if r['split']=='test'];reports=[]
    for v in variants:
        folder=output/'ablations'/f'{v["arm"]}-{v["seed"]}'/'run'
        m=evaluate_path(folder,recs,test,device,deadline)
        (folder/'new-test-once.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
        reports.append({'arm':v['arm'],'seed':v['seed'],'metrics':compact(m)})
    result['new_test_once']=reports
    from semantic_data import authored
    from fresh_diagnostic import build as old16
    from challenge import challenge
    pr,px=authored(aligned_gold=True);original,ox=load_data()
    regressions=[('prior-semantic-test-v2',pr,[r for r in px if r['split']=='test']),
        ('regression16',*old16()),('regression68',*challenge()),
        ('historical-validation',original,[r for r in ox if r['split']=='validation'])]
    result['selected_regressions']={}
    for name,recs,rows in regressions:
        m=evaluate_path(output/'run',recs,rows,device,deadline)
        (output/'run'/f'{name}.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
        result['selected_regressions'][name]=compact(m)
    result['original_test_scored']=False
    (output/'data-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    (output/'combined-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selected':winner,'validation':means,'new_test':[{'arm':x['arm'],'seed':x['seed'],**{k:v for k,v in x['metrics'].items() if k!='by_scenario'}} for x in reports]},indent=2),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=1500);p.add_argument('--max-seconds',type=int,default=1700);p.add_argument('--cpu-smoke',action='store_true');a=p.parse_args()
    if not 1<=a.steps<=1500 or not 120<=a.max_seconds<=1800:raise SystemExit('Invalid combined study bounds')
    run(a.output,a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda')

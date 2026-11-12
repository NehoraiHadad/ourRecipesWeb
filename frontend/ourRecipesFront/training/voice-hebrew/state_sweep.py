"""V12 warm adaptation: action context only, three fixed continuation seeds."""
import argparse
import gc
import json
from pathlib import Path
import shutil
import statistics
import time
from corpus import ROOT,load_data,digest
from state_data import build
from semantic_data import write
from span_pilot import run as train
from grounding_sweep import evaluate,compact
from research_decision import cost

ARMS=[('control','context-joint-v3'),('state','context-state-v4')]
SEEDS=[42,17,73]


def breakdown(rows,metrics):
    from collections import defaultdict
    kinds={r['id']:r.get('evaluation_kind','guardrail') for r in rows};groupid={r['id']:r.get('counterfactual_group') for r in rows}
    buckets=defaultdict(list);groups=defaultdict(list)
    for c in metrics['cases']:
        buckets[kinds[c['id']]].append(c)
        if groupid[c['id']]:groups[groupid[c['id']]].append(c['exact'])
    result={}
    for name,cases in buckets.items():
        true=false=expected=0
        for c in cases:
            gold={v['actionId']:v['done'] for v in c['gold']['changes']};actual={v['actionId']:v['done'] for v in c['actual']['changes']}
            true+=sum(k in gold and gold[k]==v for k,v in actual.items());false+=sum(k not in gold or gold[k]!=v for k,v in actual.items());expected+=len(gold)
        result[name]={'examples':len(cases),'exact':sum(c['exact'] for c in cases),'exact_rate':sum(c['exact'] for c in cases)/len(cases),
            'true_updates':true,'false_updates':false,'expected_updates':expected,'recall':true/expected if expected else 0,
            'precision':true/(true+false) if true+false else None,'cost':5*false+expected-true}
    result['groups']={'count':len(groups),'all_correct':sum(all(v) for v in groups.values()),'rate':sum(all(v) for v in groups.values())/len(groups) if groups else 0}
    return result


def choose(variants):
    by={(v['arm'],v['seed']):v for v in variants};reasons=[]
    for seed in SEEDS:
        c=by['control',seed]['validation_breakdown'];s=by['state',seed]['validation_breakdown']
        if s['state']['exact_rate']<c['state']['exact_rate']+.15:reasons.append(f'{seed}: state exact improvement <15pp')
        if s['groups']['rate']<.25:reasons.append(f'{seed}: complete counterfactual groups <25%')
        if s['guardrail']['false_updates']>c['guardrail']['false_updates']:reasons.append(f'{seed}: added guardrail false updates')
        if s['guardrail']['recall']<c['guardrail']['recall']-.02:reasons.append(f'{seed}: guardrail recall loss >2pp')
    costs={a:[cost(by[a,s]['report']['validation_research']) for s in SEEDS] for a,_ in ARMS}
    if statistics.mean(costs['state'])>=statistics.mean(costs['control']):reasons.append('mean cost not improved')
    if max(costs['state'])>max(costs['control']):reasons.append('worst seed cost worsened')
    return {'selected_arm':'control' if reasons else 'state','retained_seed':42,'seeds':SEEDS,'rejection_reasons':reasons,
        'validation_costs':costs,'new_test_used_for_selection':False,'role':'Research selection only; all six checkpoints retained'}


def run(output,warm,steps=750,max_seconds=2400,device='cuda'):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=True);deadline=time.monotonic()+max_seconds
    data,audit=build(output/'comparison-data');recs,rows=load_data(data)
    if device=='cuda':
        freeze=json.loads((ROOT/'verification/state-v12-data-freeze-20261112.json').read_text())
        if audit['corpus_sha256']!=freeze['corpus_sha256']:raise ValueError('Dataset differs from pretraining freeze')
    else:
        # No test rows in the CPU mechanics subset; never a quality comparison.
        tr=[r for r in rows if r['split']=='train'];val=[r for r in rows if r['split']=='validation']
        subset=tr[:32]+[r for r in tr if r.get('evaluation_kind')=='state'][:64]
        subset += [r for r in val if r.get('evaluation_kind')=='state'][:24]+[r for r in val if r.get('evaluation_kind')=='guardrail'][:24]
        data=write(output/'mechanics-subset',recs,subset,'Two-step CPU mechanics only, no test rows');recs,rows=load_data(data)
    variants=[]
    for seed in SEEDS:
        for arm,profile in ARMS:
            remaining=int(deadline-time.monotonic())
            if remaining<150:raise TimeoutError('Do not silently skip a declared arm/seed')
            folder=output/'ablations'/f'{arm}-{seed}';print(json.dumps({'phase':'train','arm':arm,'seed':seed}),flush=True)
            report=train(folder,steps=steps,max_seconds=min(450,remaining-100),device=device,model_choice='base' if device=='cuda' else 'tiny',
                train_only=True,profile=profile,eval_every=250,data_source=data,seed=seed,checkpoint_objective='cost5',
                regime='paired-family',contrast_weight=.2,checkpoint_io='best-only',warm_start=warm,encoder_lr=1e-5,head_lr=1e-4)
            cfg=json.loads((folder/'run/run-config.json').read_text());valid=[r for r in rows if r['split']=='validation']
            m=evaluate(folder/'run',recs,valid,device,deadline)
            (folder/'run/validation-research-full.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
            variants.append({'arm':arm,'seed':seed,'config':cfg,'report':report,'validation_breakdown':breakdown(valid,m)})
            (output/'state-progress.json').write_text(json.dumps(variants,ensure_ascii=False,indent=2)+'\n')
            gc.collect()
            if device=='cuda':torch.cuda.empty_cache()
    if len({v['config']['warm_start_sha256'] for v in variants})!=1:raise ValueError('Warm-start weights differ')
    frozen=choose(variants);(output/'selection-frozen.json').write_text(json.dumps(frozen,indent=2)+'\n')
    (output/'artifact-retention.json').write_text(json.dumps({'arms':['control','state'],'seeds':SEEDS},indent=2)+'\n')
    src=output/'ablations'/f'{frozen["selected_arm"]}-42'
    shutil.copytree(src/'run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'));shutil.copytree(src/'selected-data',output/'selected-data')
    result={'study':'state-v12','selection':frozen,'variants':variants,'data_audit':audit,
        'scope':'Six real T4 continuation trials from one fixed trained checkpoint' if device=='cuda' else 'Six two-step Tiny CPU mechanics trials on a subset, no fresh-test rows or quality claim',
        'new_test_evaluated':False,'human_reviewed':False,'physical_device_tested':False,'production_ready':False}
    def save():(output/'state-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    save()
    if device=='cpu':return result
    test=[r for r in rows if r['split']=='test'];result['new_test_once']=[]
    for v in variants:
        folder=output/'ablations'/f'{v["arm"]}-{v["seed"]}'/'run';m=evaluate(folder,recs,test,device,deadline)
        (folder/'new-test-once.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
        result['new_test_once'].append({'arm':v['arm'],'seed':v['seed'],'metrics':compact(m),'breakdown':breakdown(test,m)});save()
    from combined_probe import build as probe
    from grounding_data import heldouts
    rr,xx=heldouts();regressions=[('known-probe16',*probe()),('consumed-v11-test',rr,[r for r in xx if r['split']=='test'])]
    result['regressions']={}
    for seed in SEEDS:
        folder=output/'ablations'/f'{frozen["selected_arm"]}-{seed}'/'run';result['regressions'][str(seed)]={}
        for name,rr,xx in regressions:
            m=evaluate(folder,rr,xx,device,deadline);(folder/f'{name}.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
            result['regressions'][str(seed)][name]=compact(m)
    result.update(new_test_evaluated=True,original_test_scored=False);save();return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--warm-path',default=str(ROOT/'warm-start'));p.add_argument('--steps',type=int,default=750);p.add_argument('--max-seconds',type=int,default=2400);p.add_argument('--cpu-smoke',action='store_true');a=p.parse_args()
    if not 1<=a.steps<=750 or not 120<=a.max_seconds<=2700:raise SystemExit('Invalid V12 bounds')
    run(a.output,Path(a.warm_path),a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda')

"""Adaptive validation pilot: focus state learning, expand only after quality gates."""
import argparse
import gc
import json
from pathlib import Path
import shutil
import time
from corpus import ROOT,load_data
from state_pilot_data import build
from semantic_data import write
from span_pilot import run as train
from grounding_sweep import evaluate,compact
from state_metrics import breakdown


def gate(b,stress):
    reasons=[]
    if b['state']['recall']<.75:reasons.append('state update recall <75%')
    if b['groups']['rate']<.25:reasons.append('complete groups <25%')
    if b['state']['exact_rate']<.60:reasons.append('state exact <60%')
    if b['guardrail']['false_updates']>3:reasons.append('guardrail false updates > frozen control42 count3')
    if b['guardrail']['recall']<.896551724137931-.02:reasons.append('guardrail recall loss >2pp vs frozen control42')
    if stress['exact_rate']<.75:reasons.append('outside-step validation stress exact <75%')
    if stress['false_updates']:reasons.append('outside-step validation stress has false updates')
    return {'passed':not reasons,'reasons':reasons}


def run(output,warm,steps=500,max_seconds=2700,device='cuda'):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=True);deadline=time.monotonic()+max_seconds
    data,audit=build(output/'comparison-data');recs,rows=load_data(data)
    if device=='cuda':
        frozen=json.loads((ROOT/'verification/state-v13-data-freeze-20261112.json').read_text())
        if audit['corpus_sha256']!=frozen['corpus_sha256']:raise ValueError('Pilot data differs from freeze')
    else:
        tr=[r for r in rows if r['split']=='train'];val=[r for r in rows if r['split']=='validation']
        subset=[r for r in tr if r.get('evaluation_kind')!='state'][:64]+[r for r in tr if r.get('evaluation_kind')=='state'][:64]
        subset += [r for r in val if r.get('evaluation_kind')=='state'][:24]+[r for r in val if r.get('evaluation_kind')=='guardrail'][:24]
        data=write(output/'mechanics-subset',recs,subset,'Two-step CPU sampler mechanics, zero test rows');recs,rows=load_data(data)
    valid=[r for r in rows if r['split']=='validation'];variants=[]
    fixtures=json.loads((ROOT/'verification/state-v12-invariance-fixtures-20261112.json').read_text())
    sr={r['id']:r for r in fixtures['recipes']};sx=fixtures['rows']
    for seed in (42,17,73):
        folder=output/'ablations'/f'state-{seed}';left=int(deadline-time.monotonic())
        if left<150:raise TimeoutError('Insufficient bounded pilot budget')
        print(json.dumps({'phase':'train','arm':'state-balanced','seed':seed}),flush=True)
        report=train(folder,steps=steps,max_seconds=min(600,left-100),device=device,model_choice='base' if device=='cuda' else 'tiny',
            train_only=True,profile='context-state-v4',eval_every=125,data_source=data,seed=seed,checkpoint_objective='cost5',
            regime='state-balanced',contrast_weight=.2,checkpoint_io='best-only',warm_start=warm,encoder_lr=1e-5,head_lr=1e-4)
        cfg=json.loads((folder/'run/run-config.json').read_text());m=evaluate(folder/'run',recs,valid,device,deadline)
        (folder/'run/validation-research-full.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');b=breakdown(valid,m)
        if device=='cuda':
            stress=evaluate(folder/'run',sr,sx,device,deadline)
            (folder/'run/validation-stress.json').write_text(json.dumps(stress,ensure_ascii=False,indent=2)+'\n');g=gate(b,stress)
        else:stress={'scope':'not run in mechanics'};g={'passed':False,'reasons':['CPU mechanics only']}
        variants.append({'seed':seed,'config':cfg,'report':report,'validation_breakdown':b,'stress':compact(stress),'gate':g})
        (output/'state-pilot-progress.json').write_text(json.dumps(variants,ensure_ascii=False,indent=2)+'\n')
        gc.collect()
        if device=='cuda':torch.cuda.empty_cache()
        if not g['passed']:break
    all_passed=len(variants)==3 and all(v['gate']['passed'] for v in variants)
    selection={'selected_arm':'state','retained_seed':42,'seeds':[v['seed'] for v in variants],
        'qualified_for_new_test':all_passed,'reasons':[] if all_passed else variants[-1]['gate']['reasons'],
        'role':'Adaptive validation pilot; expand/score fresh test only after predeclared gates pass'}
    (output/'selection-frozen.json').write_text(json.dumps(selection,indent=2)+'\n')
    (output/'artifact-retention.json').write_text(json.dumps({'arms':['state'],'seeds':selection['seeds']},indent=2)+'\n')
    src=output/'ablations/state-42';shutil.copytree(src/'run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'));shutil.copytree(src/'selected-data',output/'selected-data')
    result={'study':'state-balanced-pilot-v13','selection':selection,'variants':variants,'data_audit':audit,
        'scope':'Real T4 validation pilot' if device=='cuda' else 'Two-step Tiny CPU subset mechanics only, no quality claim',
        'new_test_evaluated':False,'human_reviewed':False,'physical_device_tested':False,'production_ready':False}
    def save():(output/'state-pilot-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    save()
    if not all_passed:return result
    test=[r for r in rows if r['split']=='test'];result['new_test_once']=[]
    for v in variants:
        folder=output/'ablations'/f"state-{v['seed']}"/'run';m=evaluate(folder,recs,test,device,deadline)
        (folder/'new-test-once.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
        result['new_test_once'].append({'seed':v['seed'],'metrics':compact(m),'breakdown':breakdown(test,m)})
    result['new_test_evaluated']=True;save();return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--warm-path',default=str(ROOT/'warm-start'));p.add_argument('--steps',type=int,default=500);p.add_argument('--max-seconds',type=int,default=2700);p.add_argument('--cpu-smoke',action='store_true');a=p.parse_args()
    if not 1<=a.steps<=500 or not 120<=a.max_seconds<=2700:raise SystemExit('Invalid adaptive pilot bounds')
    run(a.output,Path(a.warm_path),a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda')

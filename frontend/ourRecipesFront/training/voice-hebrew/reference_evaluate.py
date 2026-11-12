"""One-shot native CPU holdout after frozen semantic-head selection."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import statistics
import time
from corpus import ROOT,load_data,digest
from reference_train import build_head,features,predicts,actuals,metrics
from reference_contract import resolve
from state_metrics import breakdown
from span_pilot import encode,infer,grounded


def run(folder):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    torch.set_num_threads(2);folder=Path(folder);result=json.loads((folder/'result.json').read_text())
    if not result['all_qualified']:raise ValueError('Both semantic head seeds must pass validation first')
    for name,h in result['plan']['source_sha256'].items():
        if digest((ROOT/name).read_bytes())!=h:raise ValueError('Selected head source changed')
    base=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run'
    with (base/'model/model.safetensors').open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
    if sha!=result['plan']['body_sha256']:raise ValueError('Frozen backbone changed')
    selection={'scope':'Frozen after validation, before new-test inference;42 primary17 secondary',
        'body_sha256':sha,'variants':[{**v,'head_sha256':digest((folder/f"head-{v['seed']}.pt").read_bytes())} for v in result['variants']]}
    (ROOT/'verification/reference-head-selection-20261112.json').write_text(json.dumps(selection,indent=2)+'\n')
    target=folder/'test-once';target.mkdir(exist_ok=False)
    (target/'selection-frozen.json').write_text(json.dumps(selection,indent=2)+'\n')
    model=AutoModelForTokenClassification.from_pretrained(base/'model',local_files_only=True,attn_implementation='eager').eval();tok=AutoTokenizer.from_pretrained(base/'model',local_files_only=True)
    for p in model.parameters():p.requires_grad_(False)
    recs,rows=load_data(ROOT/'runs/state-v13-preflight/shared');valid=[r for r in rows if r['split']=='validation'];test=[r for r in rows if r['split']=='test']
    cfg=json.loads((base/'run-config.json').read_text());baseline_threshold=json.loads((base/'research-decision.json').read_text())['threshold']
    # Live native validation turns, gold removed, versus the composed cached report.
    parity=[];timings={};sample=[valid[i*len(valid)//16] for i in range(16)]
    for v in result['variants']:
        seed=v['seed'];head=build_head();head.load_state_dict(torch.load(folder/f'head-{seed}.pt',weights_only=True));head.eval();expected={c['id']:c['actual'] for c in json.loads((folder/f'validation-{seed}.json').read_text())['cases']}
        mismatches=[];durations=[]
        for row in sample:
            clean=deepcopy(row);clean['gold']={'intent':'clarify','changes':[]};start=time.perf_counter()
            pred=predicts(head,[row['utterance']],features(model,tok,[row['utterance']]))
            mode,p=pred[row['utterance']]
            if mode!='other' and p>=v['threshold']:
                actual=resolve(recs[row['recipe_id']],{'recipe_id':row['recipe_id'],**row['state']},{'mode':mode,'confidence':p,'evidence':row['utterance']},row['utterance'],v['threshold'])
                actual={**{k:actual[k] for k in ('intent','changes')},'requiresReview':True}
            else:
                records=infer(model,tok,encode(tok,recs[row['recipe_id']],clean,cfg['span_profile']),'cpu')
                from engine import compose
                actual=compose(records,baseline_threshold);lookup={r['action_id']:r for r in records if r['task']=='action'}
                for c in actual['changes']:c['evidence']=lookup[c['actionId']]['evidence']
            durations.append(1000*(time.perf_counter()-start))
            if actual!=expected[row['id']]:mismatches.append(row['id'])
        parity.append({'seed':seed,'examples':16,'mismatches':mismatches,'scope':'Actual live native hybrid turns vs validation composition; gold removed, no new accuracy scoring'})
        timings[str(seed)]={'median_ms':statistics.median(durations),'p95_ms':sorted(durations)[15],
            'scope':'16 mixed native text turns on cloud CPU2 threads; no warmup or repeats, conditional1 reference/6 fallback queries; no phone/audio/download claim'}
    (target/'native-validation-parity.json').write_text(json.dumps({'parity':parity,'timings':timings},indent=2)+'\n')
    if any(v['mismatches'] for v in parity):raise ValueError('Live native path disagrees with composed validation')
    texts=list(dict.fromkeys(r['utterance'] for r in test));fx=features(model,tok,texts)
    clean=deepcopy(test)
    for row in clean:row['gold']={'intent':'clarify','changes':[]}
    items=[i for row in clean for i in encode(tok,recs[row['recipe_id']],row,cfg['span_profile'])]
    print(json.dumps({'phase':'native_baseline_test_once','examples':len(test),'queries':len(items)}),flush=True)
    base_metrics=grounded(test,infer(model,tok,items,'cpu'),baseline_threshold)
    (target/'baseline-test.json').write_text(json.dumps(base_metrics,ensure_ascii=False,indent=2)+'\n');baseline={c['id']:c['actual'] for c in base_metrics['cases']}
    trials=[]
    for v in result['variants']:
        seed=v['seed'];head=build_head();head.load_state_dict(torch.load(folder/f'head-{seed}.pt',weights_only=True));head.eval()
        pred=predicts(head,texts,fx);m=metrics(test,recs,actuals(test,recs,pred,baseline,v['threshold']))
        (target/f'head-{seed}-test.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
        trials.append({'seed':seed,'threshold':v['threshold'],'metrics':{k:x for k,x in m.items() if k not in ('cases','by_scenario')},'breakdown':breakdown(test,m)})
    proof={'scope':'Actual native CPU frozen-encoder/head inference, code binding and actual native baseline; shared feature/baseline computation for the two fixed heads. Synthetic authored holdout, not voice or phone.',
        'training':result,'selection':selection,'native_parity':parity,'native_timing':timings,
        'baseline_test':{k:v for k,v in base_metrics.items() if k not in ('cases','by_scenario')},'baseline_breakdown':breakdown(test,base_metrics),'new_test_once':trials,
        'head_parameters':sum(p.numel() for p in build_head().parameters()),'head_artifacts':{str(v['seed']):{'bytes':(folder/f"head-{v['seed']}.pt").stat().st_size,'sha256':digest((folder/f"head-{v['seed']}.pt").read_bytes())} for v in result['variants']},
        'new_test_evaluated':True,'physical_device_tested':False,'human_reviewed':False,'original120_test_scored':False,'production_ready':False}
    (ROOT/'verification/reference-head-results-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
    print('NATIVE_HOLDOUT_DONE',json.dumps({'baseline':proof['baseline_test'],'variants':trials,'parity':parity}),flush=True)


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');a=p.parse_args();run(a.folder)

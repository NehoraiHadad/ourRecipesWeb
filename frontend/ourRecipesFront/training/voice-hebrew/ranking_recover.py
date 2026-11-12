"""Fixed V10 contrast checkpoint recovery and validation-head diagnostics.

Original V10 selection stays control. No parameter search or fresh test score.
"""
from copy import deepcopy
import gc
import json
from pathlib import Path
import shutil
import time
from corpus import ROOT,load_data,digest
from sampling_data import build
from span_pilot import run as train
from head_trace import run as trace


def run(output,steps=1000,max_seconds=1000):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=True);deadline=time.monotonic()+min(max_seconds,1000)
    target=json.loads((ROOT/'verification/ranking-recovery-target-20261112.json').read_text())
    data,audit=build(output/'comparison-data')
    if json.loads((data/'manifest.json').read_text())['corpus_sha256']!=target['corpus_sha256']:raise ValueError('Frozen corpus mismatch')
    (output/'selection-frozen.json').write_text(json.dumps(target['original_selection'],indent=2)+'\n')
    (output/'artifact-retention.json').write_text(json.dumps({'arm':'contrast','role':'Research checkpoint recovery only; original selected arm remains control'},indent=2)+'\n')
    recs,rows=load_data(data);validation=[r for r in rows if r['split']=='validation'];reports=[]
    for seed,limit in [(42,500),(17,1000)]:
        folder=output/'ablations'/f'contrast-{seed}'
        print(json.dumps({'phase':'fixed_recovery','seed':seed,'steps':limit}),flush=True)
        report=train(folder,steps=limit,max_seconds=min(420,int(deadline-time.monotonic()-60)),device='cuda',model_choice='base',
            train_only=True,profile='context-joint-v3',eval_every=250,data_source=data,seed=seed,checkpoint_objective='f0.5',
            regime='paired-family',contrast_weight=.2,checkpoint_io='best-only')
        cfg=json.loads((folder/'run/run-config.json').read_text())
        measured=json.loads((folder/'run/validation.json').read_text())['at_0_5'];reference=target['seeds'][str(seed)]
        actual={c['id']:c['actual'] for c in measured['cases']}
        mismatch=digest(actual)!=reference['validation_sha256']
        if mismatch or cfg['selected_step']!=limit:raise ValueError('Recovery validation differs; do not substitute silently')
        cfg['artifact_role']='V10 contrast research recovery; original selected reference remains control'
        (folder/'run/run-config.json').write_text(json.dumps(cfg,indent=2)+'\n')
        (folder/'run/RESEARCH_ONLY.json').write_text(json.dumps({'original_selected_arm':'control','research_arm':'contrast','seed':seed,'step':limit},indent=2)+'\n')
        diagnostic=trace(folder/'run',recs,validation,'cuda',folder/'run/head-trace-validation.json',deadline)
        original={c['id']:c['actual'] for c in measured['cases']}
        if any(c['actual']!=original[c['id']] for c in diagnostic['cases']):raise ValueError('Observation altered validation outputs')
        # Compare only previously frozen outputs on the consumed V10 test.
        # Remove accuracy labels before encoding; no metric scoring/selection.
        test=deepcopy([r for r in rows if r['split']=='test'])
        for row in test:row['gold']={'intent':'clarify','changes':[]}
        parity=trace(folder/'run',recs,test,'cuda',folder/'run/frozen-output-parity.json',deadline,gold_analysis=False)
        parity_outputs={c['id']:c['actual'] for c in parity['cases']}
        parity_mismatch=digest(parity_outputs)!=reference['frozen_test_outputs_sha256']
        if parity_mismatch:raise ValueError('Recovered model differs from frozen test outputs; no new accuracy score')
        from combined_probe import build as probe
        pr,px=probe();known=trace(folder/'run',pr,px,'cuda',folder/'run/head-trace-known16.json',deadline)
        reports.append({'seed':seed,'steps':limit,'validation_proposal_mismatches':int(mismatch),'validation_examples':reference['validation_examples'],
            'frozen_output_parity_mismatches':int(parity_mismatch),'frozen_output_examples':reference['frozen_test_examples'],
            'validation_trace':{k:v for k,v in diagnostic.items() if k!='cases'},
            'known_trace':{k:v for k,v in known.items() if k!='cases'},'training':report,'config':cfg})
        gc.collect();torch.cuda.empty_cache()
    shutil.copytree(output/'ablations/contrast-42/run',output/'run',ignore=shutil.ignore_patterns('best-validation-model'))
    shutil.copytree(data,output/'selected-data')
    result={'study':'ranking-artifact-recovery','role':'Recover fixed validation-selected V10 contrast42/17 for research; not a new quality comparison',
        'original_primary_unchanged':True,'original_selected_arm':'control','retained_research_arm':'contrast',
        'new_test_accuracy_scored':False,'variants':reports,'data_audit':audit,'production_ready':False}
    (output/'sampling-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'phase':'recovery_complete','traces':[{k:v for k,v in x.items() if k in ('seed','steps','validation_trace','known_trace')} for x in reports]},ensure_ascii=False),flush=True)
    return result

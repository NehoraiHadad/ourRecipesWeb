"""Audit completed V11 artifacts; no training, inference or model selection changes."""
import argparse
from collections import defaultdict
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import zipfile
from corpus import ROOT,digest,load_data
from engine import verify_manifest
from grounding_sweep import choose
from research_decision import cost


def groups(metrics,rows):
    lookup={r['id']:r for r in rows};buckets=defaultdict(list)
    for case in metrics['cases']:
        name=lookup[case['id']]['scenario'];parts=name.rsplit('-',1)
        if len(parts)==2 and parts[1].isdigit():name=parts[0]
        buckets[name].append(case)
    result={}
    for name,cases in buckets.items():
        true=false=expected=exact=0
        for c in cases:
            gold={v['actionId']:v['done'] for v in c['gold']['changes']}
            actual={v['actionId']:v['done'] for v in c['actual']['changes']}
            true+=sum(k in gold and gold[k]==v for k,v in actual.items())
            false+=sum(k not in gold or gold[k]!=v for k,v in actual.items())
            expected+=len(gold);exact+=c['exact']
        result[name]={'examples':len(cases),'exact':exact,'true_updates':true,'false_updates':false,
            'expected_updates':expected,'cost':5*false+expected-true}
    if sum(v['false_updates'] for v in result.values())!=metrics['false_updates']:raise ValueError('Subgroup false count mismatch')
    if sum(v['expected_updates'] for v in result.values())!=metrics['expected_updates']:raise ValueError('Subgroup expected count mismatch')
    if sum(v['true_updates'] for v in result.values())!=metrics['proposed_updates']-metrics['false_updates']:raise ValueError('Subgroup true count mismatch')
    if sum(v['exact'] for v in result.values())!=metrics['exact_proposals']:raise ValueError('Subgroup exact count mismatch')
    return result


def validation_repairs(out,rows):
    """Matched gold actions: identify repairs and regressions, without tuning."""
    result={}
    for seed in (42,17):
        traces={arm:json.loads((out/'ablations'/f'{arm}-{seed}'/'run/head-trace-validation.json').read_text()) for arm in ('control','boundary')}
        cases={arm:{c['id']:c for c in tr['cases']} for arm,tr in traces.items()}
        repaired=lost=0;reasons=defaultdict(int)
        for row in rows:
            if row['split']!='validation':continue
            a,b=[cases[arm][row['id']] for arm in ('control','boundary')]
            predictions=[{c['actionId']:c['done'] for c in case['actual']['changes']} for case in (a,b)]
            misses={c['actionId']:c['reason'] for c in a['missed']}
            for gold in row['gold']['changes']:
                aid,done=gold['actionId'],gold['done'];old=aid in predictions[0] and predictions[0][aid]==done;new=aid in predictions[1] and predictions[1][aid]==done
                if new and not old:repaired+=1;reasons[misses[aid]]+=1
                if old and not new:lost+=1
        result[str(seed)]={'repaired_gold_updates':repaired,'lost_previously_correct_updates':lost,
            'repaired_by_control_blocking_reason':dict(reasons),'scope':'Matched validation diagnostics at preselected thresholds; no tuning or independent acceptance claim'}
        if repaired-lost!=traces['boundary']['correct_updates']-traces['control']['correct_updates']:raise ValueError('Repair/global count mismatch')
    return result


def summarize(root):
    root=Path(root);out=root/'recovered';report=json.loads((out/'grounding-report.json').read_text())
    status=json.loads((out/'status.json').read_text())
    if report['study']!='grounding-v11' or not report['new_test_evaluated'] or status['status']!='complete':raise ValueError('Require a complete V11 study')
    plan=json.loads((ROOT/'verification/grounding-plan-20261112.json').read_text())
    with zipfile.ZipFile(root/'material.zip') as z:
        for name,sha in plan['source_sha256'].items():
            if digest(z.read(name))!=sha:raise ValueError('Uploaded source differs from freeze: '+name)
    manifest=json.loads((root/'archive-manifest.json').read_text())
    with (root/'results.zip').open('rb') as f:
        if hashlib.file_digest(f,'sha256').hexdigest()!=manifest['sha256']:raise ValueError('Archive SHA mismatch')
    with zipfile.ZipFile(root/'results.zip') as z:
        if z.testzip() is not None:raise ValueError('Archive CRC mismatch')
    selection=json.loads((out/'selection-frozen.json').read_text())
    if choose(report['variants'])!=selection:raise ValueError('Validation decision differs from frozen policy')
    if verify_manifest(out/'selected-data')['corpus_sha256']!=plan['data_corpus_sha256']:raise ValueError('Corpus changed')
    _,rows=load_data(out/'selected-data');test=[r for r in rows if r['split']=='test']
    if len(test)!=252:raise ValueError('Wrong test split')
    expected={(arm,seed) for arm in ('control','boundary') for seed in (42,17)}
    if {(v['arm'],v['seed']) for v in report['new_test_once']}!=expected:raise ValueError('Incomplete four-model evaluation')
    weights={};variants=[]
    for v in report['variants']:
        arm,seed=v['arm'],v['seed'];cfg=v['config']
        for k,val in [('seed',seed),('steps_requested',1000),('corpus_sha256',plan['data_corpus_sha256']),
                ('model','dicta-il/dictabert'),('revision','8884c6db002aba4002ee638fe4070c92e9ffbbf1'),
                ('sampling','paired-family'),('contrast_weight',.2),('checkpoint_objective','cost5'),('shared_head_init',True),
                ('span_profile','context-qa-v4' if arm=='boundary' else 'context-joint-v3'),('output_channels',10 if arm=='boundary' else 8)]:
            if cfg[k]!=val:raise ValueError('Trial configuration mismatch: '+k)
        trial=out/'ablations'/f'{arm}-{seed}'/'run'
        decision=json.loads((trial/'research-decision.json').read_text());metrics=json.loads((trial/'new-test-once.json').read_text())
        if decision['threshold']!=metrics['threshold']:raise ValueError('Test threshold differs from validation choice')
        if metrics['examples']!=252 or metrics['expected_updates']!=192 or {c['id'] for c in metrics['cases']}!={r['id'] for r in test}:raise ValueError('Test case coverage mismatch')
        retained=out/'run' if arm==selection['selected_arm'] and seed==42 else out/'retained-checkpoints'/f'{arm}-{seed}'
        if json.loads((retained/'run-config.json').read_text())!=cfg:raise ValueError('Retained checkpoint identity mismatch')
        p=retained/'model/model.safetensors'
        with p.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
        weights[f'{arm}-{seed}']={'path':str(p),'bytes':p.stat().st_size,'sha256':sha,'config':cfg}
        variants.append({'arm':arm,'seed':seed,'validation':v['report']['validation_research'],
            'test':{k:x for k,x in metrics.items() if k not in ('cases','by_scenario')},'test_cost':cost(metrics),'phenomena':groups(metrics,test)})
    for seed in (42,17):
        hashes=[weights[f'{arm}-{seed}']['config']['initial_shared_head_sha256'] for arm in ('control','boundary')]
        if len(set(hashes))!=1:raise ValueError('Unmatched initialization')
    events=json.loads((root/'usage-private.json').read_text())
    balances={e['phase']:Decimal(re.search(r'Current balance:\s*([0-9.]+)',e['usage']).group(1)) for e in events if 'usage' in e}
    resources={'reported_compute_unit_delta':float(balances['before']-balances['after_cleanup']),
        'window':'Allocation/setup/training/inference/recovery/cleanup, not isolated GPU compute',
        'remote_job_seconds':status['elapsed_seconds'],'driver_seconds':next(e['seconds'] for e in events if e['phase']=='finished'),
        'artifact_recovery_method':next(e['method'] for e in events if e['phase']=='artifact_recovery'),'cleanup_completed':True}
    runtime={p.stem:json.loads(p.read_text()) for p in root.glob('runtime-*.json')}
    return {'source_commit':'226f412','source_plan':'verification/grounding-plan-20261112.json',
        'postprocessing_source_sha256':digest((ROOT/'grounding_summary.py').read_bytes()),'selection':selection,'variants':variants,
        'validation_heads':report['validation_heads'],'validation_repairs':validation_repairs(out,rows),
        'selected_regressions':report['selected_regressions'],'all_four_weights':weights,
        'training_runs':[{'arm':v['arm'],'seed':v['seed'],'selected_step':v['config']['selected_step'],
            'training_seconds':v['report']['training_seconds'],'peak_allocated_bytes':v['report']['gpu_peak_allocated_bytes']} for v in report['variants']],
        'archive':{k:manifest[k] for k in ('bytes','sha256')},'archive_sha256_crc_verified':True,
        'uploaded_source_hashes_match_plan':True,
        'local_frozen_sources_still_match':all(digest((ROOT/n).read_bytes())==sha for n,sha in plan['source_sha256'].items()),
        'resources':resources,'hardware':json.loads((out/'hardware.json').read_text()),
        'native_cpu_runtime':runtime,'scope':'Real T4 training/inference on authored synthetic recipes and text; CPU runtime measured separately in cloud workspace',
        'human_reviewed':False,'physical_device_tested':False,'original_test_scored':False,'production_ready':False,
        'state_information_limitation':'Action input unchanged:32 separate counterfactual information probes remain conflicting. Excluded from primary metrics; boundary head does not solve missing state.'}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');p.add_argument('output');a=p.parse_args()
    result=summarize(a.root);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selection':result['selection'],'test':[(v['arm'],v['seed'],v['test_cost']) for v in result['variants']]},ensure_ascii=False))

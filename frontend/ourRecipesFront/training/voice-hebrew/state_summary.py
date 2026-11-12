"""Verify V12 artifacts and report measured results; never train/infer/tune."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import zipfile
from corpus import ROOT,digest,load_data
from engine import verify_manifest
from state_sweep import choose,breakdown


def summarize(root):
    root=Path(root);out=root/'recovered';report=json.loads((out/'state-report.json').read_text())
    status=json.loads((out/'status.json').read_text());plan=json.loads((ROOT/'verification/state-v12-plan-20261112.json').read_text())
    if status['status']!='complete' or report['study']!='state-v12' or not report['new_test_evaluated']:raise ValueError('Require completed V12 study')
    with zipfile.ZipFile(root/'material.zip') as z:
        for name,sha in plan['source_sha256'].items():
            if digest(z.read(name))!=sha:raise ValueError('Uploaded frozen source changed: '+name)
    manifest=json.loads((root/'archive-manifest.json').read_text())
    with (root/'results.zip').open('rb') as f:
        if hashlib.file_digest(f,'sha256').hexdigest()!=manifest['sha256']:raise ValueError('Archive hash mismatch')
    with zipfile.ZipFile(root/'results.zip') as z:
        if z.testzip() is not None:raise ValueError('Archive CRC failure')
    if verify_manifest(out/'selected-data')['corpus_sha256']!=plan['corpus_sha256']:raise ValueError('Corpus mismatch')
    recs,rows=load_data(out/'selected-data');valid=[r for r in rows if r['split']=='validation'];test=[r for r in rows if r['split']=='test']
    if len(test)!=736 or sum(len(r['gold']['changes']) for r in test)!=512:raise ValueError('Unexpected test counts')
    frozen=json.loads((out/'selection-frozen.json').read_text())
    if choose(report['variants'])!=frozen or report['selection']!=frozen:raise ValueError('Frozen validation selection mismatch')
    if {(v['arm'],v['seed']) for v in report['new_test_once']}!={(a,s) for a in ('control','state') for s in (42,17,73)}:raise ValueError('Incomplete six-model test')
    variants=[];weights={};initial_legacy=[]
    for v in report['variants']:
        arm,seed=v['arm'],v['seed'];cfg=v['config'];trial=out/'ablations'/f'{arm}-{seed}'/'run'
        for k,value in [('model','dicta-il/dictabert'),('revision','8884c6db002aba4002ee638fe4070c92e9ffbbf1'),
                ('warm_start_sha256',plan['warm_checkpoint']['sha256']),('steps_requested',750),('encoder_lr',1e-5),('head_lr',1e-4),
                ('span_profile','context-state-v4' if arm=='state' else 'context-joint-v3'),('output_channels',8),
                ('corpus_sha256',plan['corpus_sha256']),('seed',seed),('optimizer_restored',False)]:
            if cfg[k]!=value:raise ValueError('Unexpected configuration: '+k)
        retained=out/'run' if arm==frozen['selected_arm'] and seed==42 else out/'retained-checkpoints'/f'{arm}-{seed}'
        if json.loads((retained/'run-config.json').read_text())!=cfg:raise ValueError('Retained model identity mismatch')
        p=retained/'model/model.safetensors'
        with p.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
        weights[f'{arm}-{seed}']={'path':str(p),'bytes':p.stat().st_size,'sha256':sha,'config':cfg}
        m=json.loads((trial/'new-test-once.json').read_text());decision=json.loads((trial/'research-decision.json').read_text())
        if m['threshold']!=decision['threshold']:raise ValueError('Test threshold differs from validation')
        if {c['id'] for c in m['cases']}!={r['id'] for r in test}:raise ValueError('Test case coverage mismatch')
        initial=json.loads((trial/'initial-validation.json').read_text())
        if arm=='control':initial_legacy.append({c['id']:c['actual'] for c in initial['cases']})
        val=json.loads((trial/'validation-research-full.json').read_text())
        if breakdown(valid,val)!=v['validation_breakdown']:raise ValueError('Validation subgroup inconsistency')
        variants.append({'arm':arm,'seed':seed,'selected_step':cfg['selected_step'],'validation':v['report']['validation_research'],
            'validation_breakdown':v['validation_breakdown'],'initial_validation_breakdown':breakdown(valid,initial),
            'test':{k:x for k,x in m.items() if k not in ('cases','by_scenario')},'test_breakdown':breakdown(test,m)})
    if any(c!=initial_legacy[0] for c in initial_legacy[1:]):raise ValueError('Unadapted legacy outputs differ across continuation seeds')
    events=json.loads((root/'usage-private.json').read_text())
    balances={e['phase']:Decimal(re.search(r'Current balance:\s*([0-9.]+)',e['usage']).group(1)) for e in events if 'usage' in e}
    resources={'reported_compute_unit_delta':float(balances['before']-balances['after_cleanup']),
        'window':'Allocation, model upload, setup, training, inference, recovery, cleanup',
        'remote_job_seconds':status['elapsed_seconds'],'driver_seconds':next(e['seconds'] for e in events if e['phase']=='finished'),
        'recovery_method':next(e['method'] for e in events if e['phase']=='artifact_recovery'),'cleanup_completed':True}
    runtime={p.stem:json.loads(p.read_text()) for p in root.glob('runtime-*.json')}
    stress={p.stem:json.loads(p.read_text()) for p in root.glob('stress-*.json')}
    return {'source_commit':'94060b2','source_plan':'verification/state-v12-plan-20261112.json',
        'postprocessing_source_sha256':digest((ROOT/'state_summary.py').read_bytes()),'selection':frozen,
        'variants':variants,'all_six_weights':weights,'regressions':report['regressions'],
        'unadapted_legacy_validation_outputs_identical_across_seeds':True,
        'training_runs':[{'arm':v['arm'],'seed':v['seed'],'training_seconds':v['report']['training_seconds'],
            'peak_allocated_bytes':v['report']['gpu_peak_allocated_bytes'],'selected_step':v['config']['selected_step']} for v in report['variants']],
        'archive':{k:manifest[k] for k in ('bytes','sha256')},'archive_sha256_crc_verified':True,
        'uploaded_source_hashes_match_plan':True,'local_frozen_sources_still_match':all(digest((ROOT/n).read_bytes())==sha for n,sha in plan['source_sha256'].items()),
        'resources':resources,'hardware':json.loads((out/'hardware.json').read_text()),'native_cpu_runtime':runtime,'separate_validation_invariance':stress,
        'scope':'Real T4 continuation training from one fixed trained model, three data/dropout seeds, synthetic authored correlated recipes/text. Native CPU checks separately recorded.',
        'human_reviewed':False,'physical_device_tested':False,'original_test_scored':False,'production_ready':False}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');p.add_argument('output');a=p.parse_args()
    x=summarize(a.root);Path(a.output).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n');print(json.dumps(x['selection']))

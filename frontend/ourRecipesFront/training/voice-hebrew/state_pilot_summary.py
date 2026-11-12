"""Audit the adaptive pilot and its actual gates, without training/inference."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import zipfile
from corpus import ROOT,digest,load_data
from engine import verify_manifest
from state_pilot import gate
from state_metrics import breakdown


def summarize(root):
    root=Path(root);out=root/'recovered';report=json.loads((out/'state-pilot-report.json').read_text())
    status=json.loads((out/'status.json').read_text());plan=json.loads((ROOT/'verification/state-v13-plan-20261112.json').read_text())
    if status['status']!='complete' or report['study']!='state-balanced-pilot-v13':raise ValueError('Require completed pilot execution')
    with zipfile.ZipFile(root/'material.zip') as z:
        for name,h in plan['source_sha256'].items():
            if digest(z.read(name))!=h:raise ValueError('Uploaded source differs from freeze: '+name)
    manifest=json.loads((root/'archive-manifest.json').read_text())
    with (root/'results.zip').open('rb') as f:
        if hashlib.file_digest(f,'sha256').hexdigest()!=manifest['sha256']:raise ValueError('Archive SHA mismatch')
    with zipfile.ZipFile(root/'results.zip') as z:
        if z.testzip() is not None:raise ValueError('Archive CRC failure')
    if verify_manifest(out/'selected-data')['corpus_sha256']!=plan['corpus_sha256']:raise ValueError('Corpus differs from freeze')
    _,rows=load_data(out/'selected-data');valid=[r for r in rows if r['split']=='validation'];weights={};variants=[]
    for v in report['variants']:
        seed=v['seed'];cfg=v['config'];trial=out/'ablations'/f'state-{seed}'/'run'
        for k,val in [('seed',seed),('steps_requested',500),('sampling','state-balanced'),('span_profile','context-state-v4'),
                ('output_channels',8),('warm_start_sha256',plan['warm_checkpoint']['sha256']),('encoder_lr',1e-5),('head_lr',1e-4)]:
            if cfg[k]!=val:raise ValueError('Unexpected configuration: '+k)
        metrics=json.loads((trial/'validation-research-full.json').read_text());b=breakdown(valid,metrics)
        stress=json.loads((trial/'validation-stress.json').read_text())
        if b!=v['validation_breakdown'] or gate(b,stress)!=v['gate']:raise ValueError('Stored metrics/gate inconsistent')
        retained=out/'run' if seed==42 else out/'retained-checkpoints'/f'state-{seed}'
        if json.loads((retained/'run-config.json').read_text())!=cfg:raise ValueError('Retained model identity mismatch')
        p=retained/'model/model.safetensors'
        with p.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
        weights[str(seed)]={'path':str(p),'bytes':p.stat().st_size,'sha256':h,'config':cfg}
        variants.append({**v,'initial_breakdown':breakdown(valid,json.loads((trial/'initial-validation.json').read_text())),
            'final_step_diagnostic_at_0_5':breakdown(valid,json.loads((trial/'final-step-validation.json').read_text())),
            'final_step_diagnostic_role':'Already-recorded final-step validation at fixed.5; diagnostic only, not selected checkpoint/threshold or new-test result'})
    qualified=len(variants)==3 and all(v['gate']['passed'] for v in variants)
    if qualified!=report['selection']['qualified_for_new_test'] or qualified!=report['new_test_evaluated']:raise ValueError('Adaptive test gate inconsistent')
    if not qualified and list(out.rglob('new-test-once.json')):raise ValueError('Unqualified pilot consumed test')
    events=json.loads((root/'usage-private.json').read_text());balances={e['phase']:Decimal(re.search(r'Current balance:\s*([0-9.]+)',e['usage']).group(1)) for e in events if 'usage' in e}
    runtime={p.stem:json.loads(p.read_text()) for p in root.glob('runtime-*.json')}
    parity={}
    for p in root.glob('stress-*.json'):
        seed=int(p.stem.rsplit('-',1)[1]);actual=json.loads(p.read_text())['metrics'];gpu=json.loads((out/'ablations'/f'state-{seed}'/'run/validation-stress.json').read_text())
        a={c['id']:c['actual'] for c in actual['cases']};g={c['id']:c['actual'] for c in gpu['cases']}
        parity[str(seed)]={'cases':len(a),'proposal_mismatches':sum(a[k]!=g[k] for k in a),'scope':'CPU repeat of already-used validation guard; not independent acceptance'}
    return {'source_commit':'813cf3f','source_plan':'verification/state-v13-plan-20261112.json','postprocessing_source_sha256':digest((ROOT/'state_pilot_summary.py').read_bytes()),
        'selection':report['selection'],'variants':variants,'weights':weights,'new_test_evaluated':report['new_test_evaluated'],
        'new_test_once':report.get('new_test_once',[]),'archive':{k:manifest[k] for k in ('bytes','sha256')},'archive_sha256_crc_verified':True,
        'uploaded_source_hashes_match_plan':True,'local_frozen_sources_still_match':all(digest((ROOT/n).read_bytes())==h for n,h in plan['source_sha256'].items()),
        'resources':{'reported_compute_unit_delta':float(balances['before']-balances['after_cleanup']),'remote_seconds':status['elapsed_seconds'],
            'driver_seconds':next(e['seconds'] for e in events if e['phase']=='finished'),'cleanup_completed':True},
        'hardware':json.loads((out/'hardware.json').read_text()),'native_cpu_runtime':runtime,'stress_gpu_cpu_parity':parity,
        'native_head_diagnostics':{p.stem:{k:v for k,v in json.loads(p.read_text()).items() if k!='cases'} for p in root.glob('heads-*.json')},
        'scope':'Actual T4 adaptive pilot, synthetic authored templates, CPU parity/diagnostics separately recorded. Validation stress reused as a pilot gate, not independent quality.',
        'human_reviewed':False,'physical_device_tested':False,'production_ready':False,'original_test_scored':False}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');p.add_argument('output');a=p.parse_args();x=summarize(a.root)
    Path(a.output).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n');print(json.dumps(x['selection']))

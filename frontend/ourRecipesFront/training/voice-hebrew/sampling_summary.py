"""Audit V10 artifacts and recorded scores; optional known-probe CPU parity.

No training, cloud calls, threshold tuning or new-test inference.
"""
import argparse
from collections import defaultdict
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import time
import zipfile
from corpus import ROOT,digest,load_data
from engine import verify_manifest,compose
from sampling_sweep import choose


def category(row):
    s=row['scenario']
    if s=='uncertain-confirmed':return s
    for prefix in ('history-local','history-foreign','same-object-operation','same-verb-object','object-contrast',
                   'report-question','shared-verb','implicit','nominal','correction','negative','direct',
                   'uncertain','partial','elsewhere','meta','future','other-operation','question','next','missed','advice'):
        if s.startswith(prefix):return prefix
    raise ValueError('Uncategorized held-out scenario: '+s)


def groups(metrics,rows):
    lookup={r['id']:r for r in rows};buckets=defaultdict(list)
    for case in metrics['cases']:buckets[category(lookup[case['id']])].append(case)
    result={}
    for name,cases in buckets.items():
        good=bad=expected=proposed=exact=0
        for case in cases:
            gold={c['actionId']:c['done'] for c in case['gold']['changes']}
            actual={c['actionId']:c['done'] for c in case['actual']['changes']}
            good+=sum(k in gold and gold[k]==v for k,v in actual.items())
            bad+=sum(k not in gold or gold[k]!=v for k,v in actual.items())
            expected+=len(gold);proposed+=len(actual);exact+=case['exact']
        result[name]={'examples':len(cases),'exact':exact,'true_updates':good,'false_updates':bad,'proposed_updates':proposed,
            'expected_updates':expected,'precision':good/proposed if proposed else None,'recall':good/expected if expected else None}
    for source,target in [('examples','examples'),('exact','exact_proposals'),('false_updates','false_updates'),('proposed_updates','proposed_updates'),('expected_updates','expected_updates')]:
        if sum(g[source] for g in result.values())!=metrics[target]:raise ValueError('Subgroup/global count mismatch')
    return result


def cpu_parity(run,reference):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    from span_pilot import encode,infer
    from combined_probe import build,fingerprint
    torch.set_num_threads(4);run=Path(run)
    frozen=json.loads((ROOT/'verification/combined-probe-plan-20261111.json').read_text())
    if fingerprint()['sha256']!=frozen['sha256']:raise ValueError('Known probe changed')
    recs,rows=build();rows=deepcopy(rows)
    # Only saved GPU outputs are references. Accuracy labels are removed.
    for row in rows:row['gold']={'intent':'clarify','changes':[]}
    expected={c['id']:c['actual'] for c in json.loads(Path(reference).read_text())['cases']}
    cfg=json.loads((run/'run-config.json').read_text());started=time.monotonic()
    tok=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    model=AutoModelForTokenClassification.from_pretrained(run/'model',local_files_only=True,attn_implementation='eager').eval()
    items=[i for row in rows for i in encode(tok,recs[row['recipe_id']],row,cfg['span_profile'])]
    records=infer(model,tok,items,'cpu',time.monotonic()+180);by_id=defaultdict(list)
    for record in records:by_id[record['example_id']].append(record)
    mismatches=[]
    for row in rows:
        rs=by_id[row['id']];actual=compose(rs,.5);actions={r['action_id']:r for r in rs if r['task']=='action'}
        for c in actual['changes']:c['evidence']=actions[c['actionId']]['evidence']
        if actual!=expected[row['id']]:mismatches.append(row['id'])
    return {'scope':'Native CPU known-probe output/evidence equivalence only; gold removed, no accuracy scoring or selection',
        'examples':len(rows),'mismatched_proposals':len(mismatches),'mismatch_ids':mismatches,'seconds_including_load':time.monotonic()-started}


def control_loss_parity(root):
    prior=ROOT/'runs/colab-focused-v9/remote.log';current=Path(root)/'remote.log'
    if not prior.exists() or not current.exists():return None
    def curves(path):
        result=defaultdict(dict);key=None
        for line in path.read_text(errors='replace').splitlines():
            try:value=json.loads(line)
            except (ValueError,TypeError):continue
            if not isinstance(value,dict):continue
            if 'arm' in value and value.get('phase')=='train':key=(value['arm'],value['seed'])
            if key and 'step' in value and 'loss' in value:result[key][value['step']]=value['loss']
        return result
    a,b=curves(prior),curves(current);result={}
    for seed in (42,17):
        old=a['combined',seed];new=b['control',seed];shared=sorted(set(old)&set(new))
        result[str(seed)]={'shared_logged_steps':len(shared),'mismatched_losses':[s for s in shared if old[s]!=new[s]]}
    return {'scope':'Existing logged losses only: V10 control vs V9 combined training; validation sets differ. Not a claim about unsaved weight bytes or independent accuracy.',
        'prior_log_sha256':digest(prior.read_bytes()),'current_log_sha256':digest(current.read_bytes()),'seeds':result}


def summarize(root,check_cpu=False):
    root=Path(root);recovered=root/'recovered';report=json.loads((recovered/'sampling-report.json').read_text())
    if report['study']!='sampling-v10' or not report['new_test_evaluated']:raise ValueError('Require completed V10 study')
    if json.loads((recovered/'status.json').read_text())['status']!='complete':raise ValueError('Incomplete remote job')
    plan=json.loads((ROOT/'verification/sampling-plan-20261112.json').read_text())
    with zipfile.ZipFile(root/'material.zip') as z:
        for name,sha in plan['source_sha256'].items():
            if digest(z.read(name))!=sha:raise ValueError('Uploaded source mismatch: '+name)
    manifest=json.loads((root/'archive-manifest.json').read_text())
    with (root/'results.zip').open('rb') as handle:
        if hashlib.file_digest(handle,'sha256').hexdigest()!=manifest['sha256']:raise ValueError('Archive SHA mismatch')
    with zipfile.ZipFile(root/'results.zip') as z:
        if z.testzip() is not None:raise ValueError('Archive CRC mismatch')
    frozen=json.loads((recovered/'selection-frozen.json').read_text())
    if choose(report['variants'])!=frozen:raise ValueError('Frozen validation decision mismatch')
    data=recovered/'selected-data'
    if verify_manifest(data)['corpus_sha256']!=plan['corpus_sha256']:raise ValueError('Retained corpus mismatch')
    _,rows=load_data(data);rows=[r for r in rows if r['split']=='test']
    if len(rows)!=276 or {(v['arm'],v['seed']) for v in report['new_test_once']}!={(a,s) for a in ('control','sample','contrast') for s in (42,17)}:raise ValueError('Incomplete six-trial test comparison')
    expected_regimes={a['name']:a for a in plan['arms']}
    for v in report['variants']:
        cfg=v['config'];arm=expected_regimes[v['arm']]
        if any(cfg[k]!=expected for k,expected in [('seed',v['seed']),('model',plan['model']),('revision',plan['revision']),
                ('corpus_sha256',plan['corpus_sha256']),('steps_requested',plan['steps']),('sampling',arm['sampling']),
                ('contrast_weight',arm['contrast_weight']),('checkpoint_io',plan['checkpoint_io']),('span_profile',plan['profile'])]):raise ValueError('Unmatched trial configuration')
    variants=[]
    for entry in report['new_test_once']:
        metrics=json.loads((recovered/'ablations'/f'{entry["arm"]}-{entry["seed"]}'/'run/new-test-once.json').read_text())
        variants.append({**entry,'phenomena':groups(metrics,rows)})
    arm=frozen['selected_arm'];weights={};parity={}
    for seed,run in [(42,recovered/'run'),(17,recovered/'retained-checkpoints'/f'{arm}-17')]:
        path=run/'model/model.safetensors'
        with path.open('rb') as handle:sha=hashlib.file_digest(handle,'sha256').hexdigest()
        cfg=json.loads((run/'run-config.json').read_text())
        if cfg['seed']!=seed or cfg['corpus_sha256']!=plan['corpus_sha256'] or cfg['model']!=plan['model'] or cfg['revision']!=plan['revision']:raise ValueError('Retained model configuration mismatch')
        weights[str(seed)]={'bytes':path.stat().st_size,'sha256':sha,'config':cfg}
        if check_cpu:parity[str(seed)]=cpu_parity(run,recovered/'ablations'/f'{arm}-{seed}'/'run/known-probe16.json')
    resources=None
    usage=root/'usage-private.json'
    if usage.exists():
        events=json.loads(usage.read_text());balances={v['phase']:Decimal(re.search(r'Current balance: ([0-9.]+)',v['usage']).group(1)) for v in events if 'usage' in v}
        resources={'reported_balance_delta_compute_units':float(balances['before']-balances['after_cleanup']),
            'window':'Allocation, setup, training, evaluation, artifact recovery and cleanup; not isolated GPU compute',
            'remote_job_seconds':json.loads((recovered/'status.json').read_text())['elapsed_seconds'],
            'driver_seconds':next(v['seconds'] for v in events if v['phase']=='finished'),
            'artifact_recovery_method':next(v['method'] for v in events if v['phase']=='artifact_recovery'),
            'cleanup_completed':True,'private_usage_source_sha256':digest(usage.read_bytes())}
    return {'source_commit':'06e1caf','source_plan':'verification/sampling-plan-20261112.json',
        'postprocessing_source_sha256':digest((ROOT/'sampling_summary.py').read_bytes()),'selection':frozen,
        'variants':variants,'selected_regressions':report['selected_regressions'],'weights':weights,'native_cpu_probe_parity':parity,
        'training_runs':[{'arm':v['arm'],'seed':v['seed'],'training_seconds':v['report']['training_seconds'],
            'gpu_peak_allocated_bytes':v['report']['gpu_peak_allocated_bytes'],'selected_step':v['config']['selected_step']} for v in report['variants']],
        'archive':{k:manifest[k] for k in ('archive','bytes','sha256')},'archive_sha256_crc_verified':True,'uploaded_source_hashes_match_plan':True,
        'resources':resources,'hardware':json.loads((recovered/'hardware.json').read_text()),'control_training_loss_parity':control_loss_parity(root),
        'scope':'Actual T4 training/inference on authored synthetic data; optional native CPU artifact parity. No user-device or natural-speech measurement.',
        'original_test_scored':False,'human_reviewed':False,'physical_device_tested':False,'production_ready':False}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');p.add_argument('output');p.add_argument('--cpu-probe-parity',action='store_true');a=p.parse_args()
    result=summarize(a.root,a.cpu_probe_parity);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selection':result['selection'],'native_cpu_probe_parity':result['native_cpu_probe_parity']},ensure_ascii=False,indent=2))

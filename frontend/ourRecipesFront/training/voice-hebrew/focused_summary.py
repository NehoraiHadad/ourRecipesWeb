"""Summarize recorded V9 scores; optional CPU regression for retained seed17.

No training, tuning, new-test inference, cloud allocation or application edits.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import time
import zipfile
from corpus import ROOT,digest,load_data
from engine import verify_manifest


def group_name(scenario):
    for name in ('implicit','shared-verb','report-question','correction','negative','direct',
                 'uncertain-plus-confirmed','mixed-polarity','confirmed-plus-next',
                 'local-history','foreign-history'):
        if scenario.startswith(name):return name
    return 'nonreport-'+scenario.rsplit('-',1)[0] if scenario not in ('next','missed','advice') else scenario


def grouped(metrics,rows):
    by_id={r['id']:r for r in rows};groups=defaultdict(list)
    for case in metrics['cases']:groups[group_name(by_id[case['id']]['scenario'])].append(case)
    result={}
    for name,cases in groups.items():
        good=bad=expected=proposed=exact=0
        for case in cases:
            gold={c['actionId']:c['done'] for c in case['gold']['changes']}
            actual={c['actionId']:c['done'] for c in case['actual']['changes']}
            good+=sum(k in gold and gold[k]==v for k,v in actual.items())
            bad+=sum(k not in gold or gold[k]!=v for k,v in actual.items())
            proposed+=len(actual);expected+=len(gold);exact+=case['exact']
        result[name]={'examples':len(cases),'exact':exact,'true_updates':good,'false_updates':bad,
            'proposed_updates':proposed,'expected_updates':expected,
            'precision':good/proposed if proposed else None,'recall':good/expected if expected else None}
    return result


def summarize(root,secondary_probe=False):
    root=Path(root);recovered=root/'recovered'
    selected=json.loads((recovered/'selection-frozen.json').read_text())
    report=json.loads((recovered/'combined-report.json').read_text())
    if report.get('study')!='focused-v9':raise ValueError('Require completed V9 report')
    if json.loads((recovered/'status.json').read_text())['status']!='complete':raise ValueError('Incomplete study')
    plan=json.loads((ROOT/'verification/focused-plan-20261111.json').read_text())
    with zipfile.ZipFile(root/'material.zip') as z:
        for name,sha in plan['source_sha256'].items():
            if digest(z.read(name))!=sha:raise ValueError('Uploaded source mismatch: '+name)
    manifest=json.loads((root/'archive-manifest.json').read_text())
    with (root/'results.zip').open('rb') as handle:
        if hashlib.file_digest(handle,'sha256').hexdigest()!=manifest['sha256']:raise ValueError('Archive SHA mismatch')
    with zipfile.ZipFile(root/'results.zip') as z:
        if z.testzip() is not None:raise ValueError('Archive CRC mismatch')
    data=recovered/'selected-data';verify_manifest(data)
    _,rows=load_data(data);rows=[r for r in rows if r['split']=='test']
    if len(rows)!=306 or {(v['arm'],v['seed']) for v in report['new_test_once']}!={(arm,seed) for arm in ('control','combined') for seed in (42,17)}:
        raise ValueError('Incomplete predeclared comparison')
    variants=[]
    for entry in report['new_test_once']:
        folder=recovered/'ablations'/f'{entry["arm"]}-{entry["seed"]}'/'run'
        metrics=json.loads((folder/'new-test-once.json').read_text())
        if len(metrics['cases'])!=len(rows) or metrics['threshold']!=.5:raise ValueError('Unexpected test scope or threshold')
        phenomena=grouped(metrics,rows)
        for name,target in [('examples','examples'),('exact','exact_proposals'),('false_updates','false_updates'),('proposed_updates','proposed_updates'),('expected_updates','expected_updates')]:
            if sum(g[name] for g in phenomena.values())!=metrics[target]:raise ValueError('Subgroup/global metric mismatch: '+target)
        variants.append({**entry,'phenomena':phenomena})
    arm=selected['selected_arm'];primary=recovered/'run';secondary=recovered/'retained-checkpoints'/f'{arm}-17'
    weights={}
    for name,folder in [('primary42',primary),('supplemental17',secondary)]:
        path=folder/'model/model.safetensors'
        with path.open('rb') as handle:sha=hashlib.file_digest(handle,'sha256').hexdigest()
        cfg=json.loads((folder/'run-config.json').read_text())
        if cfg['corpus_sha256']!=plan['corpora'][arm] or cfg['seed']!=(42 if name=='primary42' else 17):raise ValueError('Retained checkpoint configuration mismatch')
        weights[name]={'bytes':path.stat().st_size,'sha256':sha,'config':cfg}
    probe=None
    if secondary_probe:
        import torch
        from combined_probe import build,fingerprint
        from semantic_sweep import evaluate_path
        torch.set_num_threads(4)
        frozen_probe=json.loads((ROOT/'verification/combined-probe-plan-20261111.json').read_text())
        if fingerprint()['sha256']!=frozen_probe['sha256']:raise ValueError('Known regression data changed')
        r,x=build();probe=evaluate_path(secondary,r,x,'cpu',time.monotonic()+180)
        (root/'secondary-alias-probe16.json').write_text(json.dumps({'role':'Known synthetic regression only; no selection',
            'provenance':fingerprint(),'metrics':probe},ensure_ascii=False,indent=2)+'\n')
        probe={k:v for k,v in probe.items() if k!='cases'}
    result={'source_commit':'239530c','postprocessing_source_sha256':digest((ROOT/'focused_summary.py').read_bytes()),
        'scope':'Four real T4 trials on synthetic authored data; no physical device or natural speech test',
        'selection':selected,'variants':variants,'primary_regressions':report['selected_regressions'],
        'secondary_alias_regression':probe,'weights':weights,
        'archive':{k:manifest[k] for k in ('archive','bytes','sha256')},'archive_parts':len(manifest['parts']),
        'uploaded_source_hashes_match_plan':True,'archive_sha256_and_crc_verified':True,
        'original_test_scored':False,'human_reviewed':False,'physical_device_tested':False,'production_ready':False}
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');p.add_argument('output');p.add_argument('--secondary-probe',action='store_true');a=p.parse_args()
    result=summarize(a.root,a.secondary_probe)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selection':result['selection'],'new_test':[{k:v for k,v in x.items() if k!='phenomena'} for x in result['variants']]},ensure_ascii=False,indent=2))

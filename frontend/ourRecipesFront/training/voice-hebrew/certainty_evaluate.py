"""Frozen selection, native parity, consumed regressions; fresh test only after gates."""
from copy import deepcopy
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import resource
import statistics
import time
from corpus import ROOT,digest,load_data
from certainty_contract import route
from certainty_train import BASE,DATA,build_head,compact,native_baseline,predict,proposals
from reference_train import features,metrics
from span_pilot import encode,infer


def native_turn(model,tok,head,recipe,row,threshold,profile,base_threshold):
    from engine import compose
    label,p=predict(head,[row['utterance']],features(model,tok,[row['utterance']]))[row['utterance']]
    result=route(recipe,{'recipe_id':row['recipe_id'],**row['state']},label,p,row['utterance'],threshold)
    if result is not None:return result
    clean=deepcopy(row);clean['gold']={'intent':'clarify','changes':[]}
    records=infer(model,tok,encode(tok,recipe,clean,profile),'cpu');value=compose(records,base_threshold)
    lookup={r['action_id']:r for r in records if r['task']=='action'}
    for change in value['changes']:change['evidence']=lookup[change['actionId']]['evidence']
    return value


def run(folder):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    started=time.monotonic();torch.set_num_threads(2);folder=Path(folder)
    result=json.loads((folder/'result.json').read_text())
    for name,sha in result['plan']['source_sha256'].items():
        if digest((ROOT/name).read_bytes())!=sha:raise ValueError('Frozen source changed: '+name)
    with (BASE/'model/model.safetensors').open('rb') as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==result['plan']['body_sha256']
    selection={'created_utc':datetime.now(timezone.utc).isoformat(),'primary_seed':42,'all_qualified':result['all_qualified'],
        'body_sha256':result['plan']['body_sha256'],'variants':[{**v,'head_sha256':digest((folder/f"head-{v['seed']}.pt").read_bytes())} for v in result['variants']],
        'role':'Frozen before any consumed-regression or new-test inference; no seed switching',
        'evaluator_sha256':digest((ROOT/'certainty_evaluate.py').read_bytes()),
        'fresh_test_gate':'All three validation gates pass, native parity exact; each fresh seed requires zero false, recall>=.75 and all no-update rows clarify.'}
    target=folder/'evaluation-once';target.mkdir(exist_ok=False)
    (target/'selection.json').write_text(json.dumps(selection,indent=2)+'\n')
    (ROOT/'verification/certainty-v5-selection-20261112.json').write_text(json.dumps(selection,indent=2)+'\n')
    model=AutoModelForTokenClassification.from_pretrained(BASE/'model',local_files_only=True,attn_implementation='eager').eval()
    for parameter in model.parameters():parameter.requires_grad_(False)
    tok=AutoTokenizer.from_pretrained(BASE/'model',local_files_only=True)
    profile=json.loads((BASE/'run-config.json').read_text())['span_profile'];bt=json.loads((BASE/'research-decision.json').read_text())['threshold']
    all_recs,old=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old if r['split']=='validation' and r.get('evaluation_kind')!='state']
    sample=[guard[i*len(guard)//12] for i in range(12)]
    vf=json.loads((DATA/'validation.json').read_text());vrecs={r['id']:r for r in vf['recipes']};sample=sample+vf['rows'][:4]
    recs={**all_recs,**vrecs};parity=[];heads={}
    for v in result['variants']:
        seed=v['seed'];head=build_head();head.load_state_dict(torch.load(folder/f'head-{seed}.pt',weights_only=True));head.eval();heads[seed]=head
        report=json.loads((folder/f'validation-{seed}.json').read_text());expected={c['id']:c['actual'] for key in ('new','guard') for c in report[key]['cases']}
        times=[];bad=[]
        for row in sample:
            start=time.perf_counter();actual=native_turn(model,tok,head,recs[row['recipe_id']],row,v['threshold'],profile,bt);times.append(1000*(time.perf_counter()-start))
            if actual!=expected[row['id']]:bad.append(row['id'])
        parity.append({'seed':seed,'rows':len(sample),'mismatches':bad,'median_ms':statistics.median(times),'p95_ms':max(times),
            'scope':'Actual native complete text turns,16 known validation rows, no gold, CPU2 threads; no warmup/repeats, not device/browser/audio performance'})
    (target/'parity.json').write_text(json.dumps(parity,indent=2)+'\n')
    if any(p['mismatches'] for p in parity):raise ValueError('Native parity mismatch; neither regression nor fresh test opened')
    # Both sets have already been consumed. Score AFTER frozen selection only.
    sf=json.loads((ROOT/'verification/reference-scope-fixtures-20261112.json').read_text())
    srec={r['id']:r for r in sf['recipes']};scope=sf['rows']
    sb={c['id']:c['actual'] for c in json.loads((ROOT/'runs/reference-head-cpu-r4/scope-test-once/baseline.json').read_text())['cases']}
    test736=[r for r in old if r['split']=='test'];tb={c['id']:c['actual'] for c in json.loads((ROOT/'runs/reference-head-cpu-r2/test-once/baseline-test.json').read_text())['cases']}
    regressions={}
    for name,rows,rr,baseline in [('consumed96',scope,srec,sb),('consumed736',test736,all_recs,tb)]:
        texts=list(dict.fromkeys(r['utterance'] for r in rows));fx=features(model,tok,texts);trials=[]
        for v in result['variants']:
            seed=v['seed'];pred=predict(heads[seed],texts,fx);m=metrics(rows,rr,proposals(rows,rr,pred,baseline,v['threshold']))
            (target/f'{name}-{seed}.json').write_text(json.dumps({'metrics':m,'predictions':pred},ensure_ascii=False)+'\n');trials.append({'seed':seed,'metrics':compact(m)})
        regressions[name]=trials
    trials=[];fresh_scored=False
    if result['all_qualified']:
        print(json.dumps({'phase':'fresh480_once','role':'All three seeds qualified; selected weights/thresholds frozen'}),flush=True)
        test_dir=target/'fresh-test-once';test_dir.mkdir(exist_ok=False)
        df=json.loads((DATA/'test.json').read_text());rows=df['rows'];rr={r['id']:r for r in df['recipes']}
        texts=list(dict.fromkeys(r['utterance'] for r in rows));fx=features(model,tok,texts)
        baseline,meta=native_baseline(model,tok,rows,rr,profile,bt)
        (test_dir/'baseline.json').write_text(json.dumps({'actual':baseline,'meta':meta},ensure_ascii=False)+'\n')
        for v in result['variants']:
            seed=v['seed'];pred=predict(heads[seed],texts,fx);m=metrics(rows,rr,proposals(rows,rr,pred,baseline,v['threshold']))
            no_update={r['id'] for r in rows if not r['gold']['changes']}
            safe=sum(c['actual']['intent']=='clarify' and not c['actual']['changes'] for c in m['cases'] if c['id'] in no_update)
            accepted=m['false_updates']==0 and m['update_recall']>=.75 and safe==len(no_update)
            trials.append({'seed':seed,'accepted':accepted,'required_clarifications':len(no_update),'safe_clarifications':safe,'metrics':compact(m)})
            (test_dir/f'head-{seed}.json').write_text(json.dumps({'predictions':pred,'metrics':m},ensure_ascii=False)+'\n')
        fresh_scored=True
    proof={'study':'certainty-v5','selection':selection,'training_seconds':result['seconds'],'native_parity':parity,
        'consumed_regressions_after_selection':regressions,'regression_role':'Diagnostic only; frozen decisions never changed after scoring; cached actual native CPU legacy baseline plus current real features/head.',
        'fresh_test_scored':fresh_scored,'fresh_test_once':trials,
        'all_fresh_accepted':fresh_scored and all(t['accepted'] for t in trials),
        'head_parameters':sum(p.numel() for p in build_head().parameters()),
        'head_bytes':{str(v['seed']):(folder/f"head-{v['seed']}.pt").stat().st_size for v in result['variants']},
        'runtime':{'seconds':time.monotonic()-started,'python':platform.python_version(),'torch':torch.__version__,'threads':2,'logical_cpus':os.cpu_count(),'affinity_cpus':len(os.sched_getaffinity(0)),
            'peak_process_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,'rss_scope':'Whole evaluator process, includes batch features/inference; not mobile working set'},
        'physical_device_tested':False,'human_reviewed':False,'original120_scored':False,'production_ready':False,
        'scope':'Real CPU neural inference and deterministic code on authored correlated synthetic fixtures; controls/unit tests separately may be mocked. No audio/browser/phone.'}
    (ROOT/'verification/certainty-v5-results-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print('CERTAINTY_EVALUATED',json.dumps(proof),flush=True)
    return proof


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');a=p.parse_args();run(a.folder)

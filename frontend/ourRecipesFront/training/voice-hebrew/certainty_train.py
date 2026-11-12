"""Prospective three-seed CPU study; consumed tests never select a checkpoint."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from corpus import ROOT, digest, load_data
from certainty_data import LABELS
from certainty_contract import route
from reference_train import features, metrics
from span_pilot import encode, infer, grounded

SEEDS = (42,17,73)
THRESHOLDS = (.5,.7,.85,.95,.99)
BASE = ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run'
DATA = ROOT/'verification/certainty-v5-data-20261112'


def build_head():
    import torch
    return torch.nn.Sequential(torch.nn.LayerNorm(1536),torch.nn.Linear(1536,128),torch.nn.GELU(),torch.nn.Dropout(.1),torch.nn.Linear(128,5))


def predict(head,texts,x):
    import torch
    head.eval()
    with torch.inference_mode(): confidence,idx=head(x).softmax(-1).max(-1)
    return {t:(LABELS[int(i)],float(c)) for t,i,c in zip(texts,idx,confidence)}


def proposals(rows,recs,pred,baseline,threshold):
    output={}
    for row in rows:
        label,p=pred[row['utterance']]
        value=route(recs[row['recipe_id']],{'recipe_id':row['recipe_id'],**row['state']},label,p,row['utterance'],threshold)
        output[row['id']]=baseline[row['id']] if value is None else value
    return output


def native_baseline(model,tok,rows,recs,profile,threshold):
    """Deduplicate identical gold-free model inputs; decode once and restore IDs."""
    clean=deepcopy(rows)
    for row in clean:row['gold']={'intent':'clarify','changes':[]}
    items=[i for row in clean for i in encode(tok,recs[row['recipe_id']],row,profile)]
    unique={};keys=[]
    for item in items:
        key=digest({k:item[k] for k in ('inputs','positions','offsets','current_start','current_utterance','profile')})+item['query']['task']
        unique.setdefault(key,item);keys.append(key)
    raw=infer(model,tok,list(unique.values()),'cpu');lookup=dict(zip(unique,raw));records=[]
    for item,key in zip(items,keys):
        record=lookup[key]
        records.append({**item['query'],**{k:record[k] for k in ('prediction','confidence')},'evidence':record.get('evidence')})
    m=grounded(rows,records,threshold)
    return {c['id']:c['actual'] for c in m['cases']},{'rows':len(rows),'queries':len(items),'unique_queries':len(unique),'gold_removed':True}


def gates(fresh,guard,stress,uncertain_ids):
    cases=fresh['cases']; uncertain=[c for c in cases if c['id'] in uncertain_ids]
    uncertain_safe=sum(c['actual']['intent']=='clarify' and not c['actual']['changes'] for c in uncertain)
    checks={'new_reference_recall':fresh['update_recall']>=.75,
        'new_no_false_updates':fresh['false_updates']==0,
        'new_uncertain_all_clarify':uncertain_safe==len(uncertain),
        'guard_no_extra_false':guard['false_updates']<=3,
        'guard_recall_floor':guard['update_recall']>=.876551724137931,
        'guard_exact_floor':guard['exact_proposals']>=294,
        'outside_invariance':stress['false_updates']==0 and stress['exact_rate']>=.75}
    return {'passed':all(checks.values()),'checks':checks,'uncertain_examples':len(uncertain),'uncertain_safe':uncertain_safe}


def compact(m):return {k:v for k,v in m.items() if k not in ('cases','by_scenario')}


def run(output):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    started=time.monotonic();torch.set_num_threads(2);folder=Path(output);folder.mkdir(parents=True,exist_ok=False)
    data_plan=json.loads((DATA/'plan.json').read_text())
    for name,sha in data_plan['files'].items():
        if digest((DATA/name).read_bytes())!=sha:raise ValueError('Data changed')
    if digest((ROOT/'certainty_data.py').read_bytes())!=data_plan['source_sha256']:raise ValueError('Data source changed')
    language=json.loads((DATA/'language.json').read_text());training=language['train']
    fixture=json.loads((DATA/'validation.json').read_text());rows=fixture['rows'];recs={r['id']:r for r in fixture['recipes']}
    uncertain_ids={r['id'] for r in rows if r['evaluation_kind']=='uncertain'}
    old_recs,old_rows=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old_rows if r['split']=='validation' and r.get('evaluation_kind')!='state']
    sf=json.loads((ROOT/'verification/state-v12-invariance-fixtures-20261112.json').read_text());stress=sf['rows'];sr={r['id']:r for r in sf['recipes']}
    with (BASE/'model/model.safetensors').open('rb') as stream:body_sha=hashlib.file_digest(stream,'sha256').hexdigest()
    assert body_sha=='f053074f0118ebdd8157906ef862001135c6b9d6b3e15810e5aca25f6dc30bb4'
    sources=('certainty_data.py','certainty_contract.py','certainty_train.py','reference_contract.py','reference_train.py','reference_data.py','span_pilot.py','corpus.py','engine.py')
    plan={'created_utc':datetime.now(timezone.utc).isoformat(),'study':'certainty-v5','seeds':SEEDS,'primary_seed':42,
        'steps':500,'eval_every':50,'thresholds':THRESHOLDS,'optimizer':'AdamW lr.001 decay.01, inverse-class-frequency full-batch CE',
        'body_sha256':body_sha,'body_frozen':True,'head_labels':LABELS,'training_count':len(training),
        'data_plan_sha256':digest((DATA/'plan.json').read_bytes()),'source_sha256':{n:digest((ROOT/n).read_bytes()) for n in sources},
        'selection':'Validation only: all gates first, then cost5*false+missed across new validation and guard, then new recall/exact, then higher threshold. Earlier step wins ties.',
        'gates':'new recall>=.75, zero new false, all uncertain clarify; guard false<=3,recall>=.876551724137931,exact>=294;stress false0/exact>=.75',
        'test_policy':'New480 opens once only if all three seeds qualify; then score all fixed seeds. No consumed736/96 selection; original120 untouched.',
        'new_test_inference':False}
    (folder/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
    model=AutoModelForTokenClassification.from_pretrained(BASE/'model',local_files_only=True,attn_implementation='eager').eval()
    for parameter in model.parameters():parameter.requires_grad_(False)
    tok=AutoTokenizer.from_pretrained(BASE/'model',local_files_only=True)
    profile=json.loads((BASE/'run-config.json').read_text())['span_profile'];bt=json.loads((BASE/'research-decision.json').read_text())['threshold']
    print(json.dumps({'phase':'new_validation_native_baseline','rows':len(rows)}),flush=True)
    baseline,bmeta=native_baseline(model,tok,rows,recs,profile,bt)
    stress_base,smeta=native_baseline(model,tok,stress,sr,profile,bt)
    parity_rows=deepcopy(stress[:4])
    for row in parity_rows:row['gold']={'intent':'clarify','changes':[]}
    direct=grounded(stress[:4],infer(model,tok,[i for row in parity_rows for i in encode(tok,sr[row['recipe_id']],row,profile)],'cpu'),bt)
    assert all(c['actual']==stress_base[c['id']] for c in direct['cases']), 'Native input-cache parity mismatch'
    (folder/'cache-parity.json').write_text(json.dumps({'examples':4,'proposal_mismatches':0,'scope':'Actual CPU cached-input vs direct inference; known validation only'})+'\n')
    guard_base={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']}
    (folder/'native-baseline.json').write_text(json.dumps({'validation':baseline,'stress':stress_base,'meta':[bmeta,smeta]},ensure_ascii=False)+'\n')
    texts=list(dict.fromkeys([r['text'] for r in training]+[r['utterance'] for r in rows+guard+stress]));lookup={t:i for i,t in enumerate(texts)}
    print(json.dumps({'phase':'frozen_features','texts':len(texts)}),flush=True)
    fx=features(model,tok,texts);x=fx[[lookup[r['text']] for r in training]];y=torch.tensor([LABELS.index(r['label']) for r in training])
    count=torch.bincount(y,minlength=5).float();weight=count.sum()/(5*count);variants=[]
    for seed in SEEDS:
        torch.manual_seed(seed);head=build_head();opt=torch.optim.AdamW(head.parameters(),lr=.001,weight_decay=.01);best=None
        for step in range(1,501):
            head.train();opt.zero_grad(set_to_none=True);loss=torch.nn.functional.cross_entropy(head(x),y,weight=weight);loss.backward();opt.step()
            if step%50:continue
            pred=predict(head,texts,fx)
            for threshold in THRESHOLDS:
                nm=metrics(rows,recs,proposals(rows,recs,pred,baseline,threshold));gm=metrics(guard,old_recs,proposals(guard,old_recs,pred,guard_base,threshold));sm=metrics(stress,sr,proposals(stress,sr,pred,stress_base,threshold))
                gate=gates(nm,gm,sm,uncertain_ids);cost=sum(5*m['false_updates']+m['expected_updates']-(m['proposed_updates']-m['false_updates']) for m in (nm,gm))
                key=(gate['passed'],-cost,nm['update_recall'],nm['exact_proposals'],threshold)
                if best is None or key>tuple(best['key']):
                    best={'seed':seed,'step':step,'threshold':threshold,'gate':gate,'key':key,'validation':compact(nm),'guard':compact(gm),'stress':compact(sm),'loss':float(loss.detach())}
                    torch.save(head.state_dict(),folder/f'head-{seed}.pt')
                    (folder/f'validation-{seed}.json').write_text(json.dumps({'new':nm,'guard':gm,'stress':sm,'predictions':pred},ensure_ascii=False)+'\n')
            print(json.dumps({'seed':seed,'step':step,'selected_step':best['step'],'threshold':best['threshold'],'gate':best['gate'],'new':best['validation']}),flush=True)
        variants.append(best)
    result={'plan':plan,'variants':variants,'all_qualified':all(v['gate']['passed'] for v in variants),'seconds':time.monotonic()-started,
        'new_test_inference':False,'physical_device_tested':False,'human_reviewed':False,
        'validation_fallback':'Actual native CPU new/stress; saved exact frozen T4 guard outputs; shared input cache only, no synthetic fallback',
        'baseline_meta':[bmeta,smeta]}
    (folder/'result.json').write_text(json.dumps(result,indent=2)+'\n');print('CERTAINTY_DONE',json.dumps(result),flush=True)
    return result


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');a=p.parse_args();run(a.output)

"""Post-test CPU validation ablation: minimum vs geometric token confidence.

No training, test-set inference, threshold search or deployed decoder change.
"""
import argparse
from copy import deepcopy
import json
import math
from pathlib import Path
import time
from corpus import ROOT,digest,load_data
from engine import records_from_logits
from span_pilot import encode,decode,grounded
from combined_probe import build,fingerprint


def run(root,output):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    torch.set_num_threads(4);root=Path(root);out=Path(output)
    if not (root/'selection-frozen.json').exists():raise ValueError('Require selected V9 weights')
    weights=root/'run/model';tok=AutoTokenizer.from_pretrained(weights,local_files_only=True)
    model=AutoModelForTokenClassification.from_pretrained(weights,local_files_only=True,attn_implementation='eager').eval()
    r,x=load_data(root/'selected-data');validation=[row for row in x if row['split']=='validation']
    pr,px=build();started=time.monotonic();deadline=started+300;results={}
    for name,recs,rows in [('validation',r,validation),('known_probe16',pr,px)]:
        items=[item for row in rows for item in encode(tok,recs[row['recipe_id']],row,'context-joint-v3')]
        original=[];geometric=[]
        for off in range(0,len(items),16):
            if time.monotonic()>deadline:raise TimeoutError('Bounded CPU diagnostic exceeded')
            batch=items[off:off+16];ins=tok.pad([item['inputs'] for item in batch],return_tensors='pt')
            with torch.inference_mode():values=model(**ins).logits.tolist()
            for item,logits in zip(batch,values):
                record=decode(item,logits);original.append(record);alternative=deepcopy(record)
                if record.get('evidence'):
                    q=item['query'];pair=records_from_logits([q],[logits[0]])[0]
                    token_records=[records_from_logits([q],[logits[p]])[0] for p in item['positions']]
                    confidences=[z['confidence'] for z in token_records if z['prediction']==record['prediction']]
                    alternative['confidence']=min(pair['confidence'],math.exp(sum(math.log(c) for c in confidences)/len(confidences)))
                geometric.append(alternative)
        base=grounded(rows,original,.5);candidate=grounded(rows,geometric,.5)
        results[name]={'minimum':base,'geometric':candidate}
        print(json.dumps({'phase':name,**{k:{kk:vv for kk,vv in v.items() if kk not in ('cases','by_scenario')} for k,v in results[name].items()}}),flush=True)
    b=results['validation']['minimum'];c=results['validation']['geometric']
    pb=results['known_probe16']['minimum'];pc=results['known_probe16']['geometric']
    eligible=c['false_updates']<=b['false_updates'] and c['update_recall']>=b['update_recall'] and c['exact_proposals']>=b['exact_proposals'] and pc['false_updates']<=pb['false_updates']
    full={'scope':'Actual CPU, post-test validation/known-probe diagnosis only; no new-test inference or tuning',
        'threshold':.5,'eligibility':'No increase in false updates on validation or known probe; validation recall and state exact nondecreasing. Eligibility would still need a future independent test.',
        'eligible_on_validation_and_known_probe':eligible,'deployed_decoder_changed':False,
        'seconds':time.monotonic()-started,'source_sha256':digest((ROOT/'confidence_probe.py').read_bytes()),
        'probe_fingerprint':fingerprint(),'results':results}
    out.write_text(json.dumps(full,ensure_ascii=False,indent=2)+'\n')
    compact=deepcopy(full)
    for study in compact['results'].values():
        for metrics in study.values():metrics.pop('cases');metrics.pop('by_scenario')
    (ROOT/'verification/focused-confidence-20261111.json').write_text(json.dumps(compact,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'eligible':eligible,'seconds':full['seconds']}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('recovered');p.add_argument('output');a=p.parse_args();run(a.recovered,a.output)

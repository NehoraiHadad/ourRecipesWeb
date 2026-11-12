"""Observe intent/candidate/evidence decisions without altering the decoder."""
from collections import Counter,defaultdict
import json
from pathlib import Path
import time
from engine import compose,records_from_logits
from span_pilot import encode,decode


def explain(item,logits):
    q=item['query'];record=decode(item,logits)
    cls=records_from_logits([q],[logits[0]])[0]
    trace={'example_id':q['example_id'],'task':q['task'],'action_id':q.get('action_id'),
        'cls_prediction':cls['prediction'],'cls_confidence':cls['confidence'],
        'prediction':record['prediction'],'confidence':record['confidence'],'evidence':record.get('evidence')}
    if q['task']=='intent':trace['reason']='intent';return record,trace
    chunks=[];active=None
    for p in item['positions']:
        token=records_from_logits([q],[logits[p]])[0];b,e=item['offsets'][p]
        if token['prediction'] not in ('done','not_done'):active=None;continue
        if active is None or active['label']!=token['prediction']:
            active={'label':token['prediction'],'begin':b,'end':e,'confidence':token['confidence']};chunks.append(active)
        else:active['end']=e;active['confidence']=min(active['confidence'],token['confidence'])
    for c in chunks:c['text']=item['current_utterance'][c['begin']-item['current_start']:c['end']-item['current_start']]
    trace['chunks']=chunks
    if cls['prediction']=='not_mentioned':reason='candidate_absent'
    elif not chunks:reason='no_evidence'
    elif len(chunks)>1:reason='conflicting_evidence' if len({c['label'] for c in chunks})>1 else 'fragmented_evidence'
    elif cls['prediction']!=chunks[0]['label']:reason='polarity_conflict'
    elif record['prediction']=='not_mentioned':reason='short_or_generic_evidence'
    elif cls['confidence']<.5:reason='candidate_confidence'
    elif record['confidence']<.5:reason='evidence_confidence'
    else:reason='accepted_before_intent_gate'
    trace['reason']=reason;return record,trace


def run(run,recs,rows,device,output,deadline=None,gold_analysis=True):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    run=Path(run);cfg=json.loads((run/'run-config.json').read_text())
    model=AutoModelForTokenClassification.from_pretrained(run/'model',local_files_only=True,attn_implementation='eager').to(device).eval()
    tok=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    items=[i for row in rows for i in encode(tok,recs[row['recipe_id']],row,cfg['span_profile'])]
    records=[];traces=[]
    for off in range(0,len(items),16):
        if deadline and time.monotonic()>deadline:raise TimeoutError('Trace deadline exceeded')
        batch=items[off:off+16];ins=tok.pad([i['inputs'] for i in batch],return_tensors='pt')
        with torch.inference_mode():values=model(**{k:v.to(device) for k,v in ins.items()}).logits.float().cpu().tolist()
        for item,logits in zip(batch,values):
            record,trace=explain(item,logits);records.append(record);traces.append(trace)
    by=defaultdict(list);tr=defaultdict(list)
    for r in records:by[r['example_id']].append(r)
    for r in traces:tr[r['example_id']].append(r)
    cases=[];misses=Counter();false=Counter();expected=correct=0
    for row in rows:
        actual=compose(by[row['id']],.5);lookup={r['action_id']:r for r in by[row['id']] if r['task']=='action'}
        actions={r['action_id']:r for r in tr[row['id']] if r['task']=='action'}
        for c in actual['changes']:c['evidence']=lookup[c['actionId']]['evidence']
        predicted={c['actionId']:c['done'] for c in actual['changes']};gold={c['actionId']:c['done'] for c in row['gold']['changes']} if gold_analysis else {}
        details=[]
        for action,done in gold.items():
            expected+=1
            if action in predicted and predicted[action]==done:correct+=1;continue
            trace=actions[action]
            reason='intent_gate' if actual['intent']!='report' and trace['reason']=='accepted_before_intent_gate' else trace['reason']
            if trace['cls_prediction'] in ('done','not_done') and (trace['cls_prediction']=='done')!=done:reason='wrong_polarity'
            misses[reason]+=1;details.append({'actionId':action,'done':done,'reason':reason})
        if gold_analysis:
            for action,done in predicted.items():
                if action not in gold or gold[action]!=done:false['unsupported_action' if action not in gold else 'wrong_polarity']+=1
        cases.append({'id':row['id'],'utterance':row['utterance'],'scenario':row['scenario'],'actual':actual,'missed':details,'heads':tr[row['id']]})
    result={'scope':'Actual native model trace; diagnostic, not new independent acceptance','examples':len(rows),
        'gold_analysis':gold_analysis,'expected_updates':expected if gold_analysis else None,'correct_updates':correct if gold_analysis else None,
        'missed_updates':expected-correct if gold_analysis else None,
        'miss_reasons':dict(misses) if gold_analysis else None,'false_reasons':dict(false) if gold_analysis else None,'cases':cases}
    Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result

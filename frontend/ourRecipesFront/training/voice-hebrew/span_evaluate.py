"""Validation-only fine confidence grid and an optional single frozen test evaluation."""
import argparse
import json
from pathlib import Path
from corpus import load_data
from engine import verify_manifest,allowed
from span_pilot import encode, infer, grounded, decode

GRID=[.5,.6,.7,.8,.85,.9,.95,.99,.995,.999,.9995,.9999,.99995,.99999,.999999,1.0]


def browser_fixtures(run):
    import numpy as np
    import onnxruntime as ort
    from transformers import AutoTokenizer
    run=Path(run);tokenizer=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    profile=json.loads((run/'run-config.json').read_text()).get('span_profile','span-v1')
    recs,rows=load_data(run.parent/'selected-data');selected=[r for r in rows if r['split']=='validation']
    items=[x for row in selected for x in encode(tokenizer,recs[row['recipe_id']],row,profile)]
    calibrated=json.loads((run/'validation-fine.json').read_text());threshold=calibrated['int8']['threshold']
    # Exercise supported paths even when quantization removes every accepted
    # update. An all-abstain parity result must not be mistaken for usefulness.
    accepted={case['id'] for engine in ['fp32','int8'] for case in calibrated[engine]['cases'] if case['actual']['changes']}
    batches=[items[:1],items[5:7],items[10:13],items[25:29]]
    batches += [[x for x in items if x['query']['example_id']==key] for key in sorted(accepted)[:4]]
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    sessions={name:ort.InferenceSession(str(run/'onnx'/name),sess_options=options,providers=['CPUExecutionProvider']) for name in ['model.onnx','model.int8.onnx']}
    fixtures=[]
    for batch in batches:
        inputs=tokenizer.pad([x['inputs'] for x in batch],padding=True,return_tensors='np')
        arrays={k:v.astype(np.int64) for k,v in inputs.items()};width=arrays['input_ids'].shape[1]
        decisions=[]
        for j,x in enumerate(batch):
            for i in ([0] if x['query']['task']=='intent' else ([0] if x.get('joint_gate') else [])+x['positions']):decisions.append({'offset':(j*width+i)*8,'indices':allowed(x['query']['task'])})
        fixtures.append({'inputs':{k:{'dims':list(v.shape),'data':v.flatten().tolist()} for k,v in arrays.items()},
            'expected':sessions['model.int8.onnx'].run(None,arrays)[0].tolist(),
            'fp32_expected':sessions['model.onnx'].run(None,arrays)[0].tolist(),'threshold':threshold,'decisionRows':decisions,
            'spanItems':[{'task':x['query']['task'],'positions':x['positions'],'offsets':x['offsets'],
                'current_start':x['current_start'],'current_utterance':x['current_utterance'],'joint_gate':x.get('joint_gate',False)} for x in batch]})
    (run/'onnx/browser-fixtures.json').write_text(json.dumps(fixtures)+'\n')
    print(json.dumps({'batches':len(fixtures),'queries':sum(len(b) for b in batches),'accepted_validation_examples_included':min(4,len(accepted)),'threshold':threshold}))


def select_policy(rows,records):
    candidates=[grounded(rows,records,t) for t in GRID]
    safe=[x for x in candidates if x['false_updates']==0 and x['nonmatching_gold_evidence']==0]
    best=max(safe,key=lambda x:(x['exact_including_gold_evidence'],x['update_recall'],-x['threshold']))
    return best,[{k:v for k,v in x.items() if k not in ['cases','by_scenario']} for x in candidates]


def diagnostic_browser_fixtures(run):
    """Reuse measured native tensors; exercise positive paths, never select policy."""
    run=Path(run);fixtures=json.loads((run/'challenge-browser-fixtures.json').read_text())
    chosen=[];positive=0
    for fixture in fixtures:
        accepted=0
        for item,logits in zip(fixture['spanItems'],fixture['expected']):
            record=decode({**item,'query':{'task':item['task']}},logits)
            accepted+=int(record['prediction'] in ['done','not_done'] and record['confidence']>=.5)
        if accepted:
            chosen.append({**fixture,'threshold':.5});positive+=accepted
        if len(chosen)==3:break
    if not positive:raise ValueError('Diagnostic contains no accepted native action records')
    folder=run/'diagnostic-browser';folder.mkdir(exist_ok=True)
    (folder/'browser-fixtures.json').write_text(json.dumps(chosen)+'\n')
    proof={'role':'Post-selection regression tensor portability probe at threshold 0.5; never deployment policy, calibration or quality certification',
        'batches':len(chosen),'queries':sum(len(f['spanItems']) for f in chosen),'native_accepted_action_records':positive}
    (folder/'provenance.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))


def evaluate(run, test=False, onnx_fp32=False):
    import torch
    import onnxruntime as ort
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    torch.set_num_threads(4);run=Path(run);data=run.parent/'selected-data'
    manifest=verify_manifest(data);config=json.loads((run/'run-config.json').read_text())
    if config['corpus_sha256']!=manifest['corpus_sha256']:raise ValueError('Evaluation data changed')
    recs,rows=load_data(data)
    tokenizer=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    model=None if onnx_fp32 else AutoModelForTokenClassification.from_pretrained(run/'model',local_files_only=True,attn_implementation='eager').eval()
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    session=ort.InferenceSession(str(run/'onnx/model.int8.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    fp_session=ort.InferenceSession(str(run/'onnx/model.onnx'),sess_options=options,providers=['CPUExecutionProvider']) if onnx_fp32 else None
    def predict(split):
        selected=[r for r in rows if r['split']==split]
        items=[item for row in selected for item in encode(tokenizer,recs[row['recipe_id']],row,config.get('span_profile','span-v1'))]
        return selected,infer(model,tokenizer,items,'cpu',onnx=fp_session),infer(model,tokenizer,items,'cpu',onnx=session)
    if not test:
        selected,fp32,int8=predict('validation');best,candidates=select_policy(selected,fp32)
        quantized=grounded(selected,int8,best['threshold'])
        report={'selection':'Validation-only fixed finer grid; single joint threshold; no model retraining or test selection. Zero observed errors is not a statistical guarantee.',
            'fp32_engine':'native ORT' if onnx_fp32 else 'PyTorch','grid':GRID,'candidates':candidates,'fp32':best,'int8':quantized,'corpus_sha256':manifest['corpus_sha256'],'production_ready':False}
        (run/'validation-fine.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        decision={'threshold':best['threshold'],'selected_on':'validation','method':'fixed fine grid with exact gold evidence','corpus_sha256':manifest['corpus_sha256'],'production_ready':False}
        (run/'decision-calibrated.json').write_text(json.dumps(decision,indent=2)+'\n')
        for p in [run/'onnx/browser-fixtures.json',run/'challenge-browser-fixtures.json']:
            if not p.exists():continue
            fixtures=json.loads(p.read_text())
            for f in fixtures:f['threshold']=best['threshold']
            p.write_text(json.dumps(fixtures)+'\n')
        print(json.dumps({engine:{k:v for k,v in report[engine].items() if k not in ['cases','by_scenario']} for engine in ['fp32','int8']},indent=2))
        return report
    validation=json.loads((run/'validation-fine.json').read_text())
    for engine in ['fp32','int8']:
        m=validation[engine]
        if (m['update_precision'] or 0)<.99 or m['update_recall']<.8 or m['nonmatching_gold_evidence']:
            raise ValueError('Validation gate failed; keep test unused')
    decision=json.loads((run/'decision-calibrated.json').read_text())
    if (run/'evaluation-test-frozen.json').exists():raise ValueError('Test was already evaluated; do not repeatedly tune on it')
    selected,fp32,int8=predict('test');threshold=decision['threshold']
    report={'threshold':threshold,'selected_on':'validation only','data_review':'pending; synthetic test, not natural-conversation acceptance',
        'fp32':grounded(selected,fp32,threshold),'int8':grounded(selected,int8,threshold),'production_ready':False}
    (run/'evaluation-test-frozen.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({engine:{k:v for k,v in report[engine].items() if k not in ['cases','by_scenario']} for engine in ['fp32','int8']},indent=2))
    return report


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run');p.add_argument('--test',action='store_true');p.add_argument('--onnx-fp32',action='store_true');p.add_argument('--make-browser-fixtures',action='store_true');p.add_argument('--make-diagnostic-browser-fixtures',action='store_true');a=p.parse_args()
    if a.make_diagnostic_browser_fixtures:diagnostic_browser_fixtures(a.run)
    elif a.make_browser_fixtures:browser_fixtures(a.run)
    else:evaluate(a.run,a.test,a.onnx_fp32)

"""Evaluate one selected candidate at frozen thresholds on an independent challenge."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import time
from challenge import challenge, fingerprint
from engine import expand, encode, records_from_logits, score


def evaluate(run, output):
    import numpy as np
    import torch
    import onnxruntime as ort
    from transformers import AutoTokenizer,AutoModelForSequenceClassification
    torch.set_num_threads(4)
    run,output=Path(run),Path(output);output.mkdir(parents=True,exist_ok=False)
    config=json.loads((run/'run-config.json').read_text())
    threshold=json.loads((run/'decision.json').read_text())['threshold']
    recs,rows=challenge();items=expand(recs,rows,'challenge',config['input_contract'])
    tokenizer=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    model=AutoModelForSequenceClassification.from_pretrained(run/'model',local_files_only=True,attn_implementation='eager').eval()
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    session=ort.InferenceSession(str(run/'onnx/model.int8.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    native=[];quantized=[];fixtures=[];began=time.monotonic()
    for offset in range(0,len(items),16):
        batch=items[offset:offset+16]
        inputs=tokenizer.pad([encode(tokenizer,q,512) for q in batch],padding=True,return_tensors='pt')
        with torch.inference_mode():fp32=model(**inputs).logits.numpy()
        arrays={k:v.numpy().astype(np.int64) for k,v in inputs.items()}
        int8=session.run(None,arrays)[0]
        native.extend(records_from_logits(batch,fp32.tolist()));quantized.extend(records_from_logits(batch,int8.tolist()))
        fixtures.append({'inputs':{k:{'dims':list(v.shape),'data':v.flatten().tolist()} for k,v in arrays.items()},
            'expected':int8.tolist(),'fp32_expected':fp32.tolist(),'tasks':[q['task'] for q in batch],'threshold':threshold})
    report={'scope':'Previously frozen synthetic diagnostic, not a human/physical-device benchmark',
        'challenge':fingerprint(),'model_run':run.name,'input_contract':config['input_contract'],
        'threshold_selected_on':'original validation, not this challenge','selected_threshold':threshold,
        'pytorch_selected':score(rows,native,threshold),'pytorch_0_5':score(rows,native,.5),
        'int8_selected':score(rows,quantized,threshold),'seconds':time.monotonic()-began,
        'production_ready':False,'test_evaluated':False}
    (output/'challenge.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (output/'browser-fixtures.json').write_text(json.dumps(fixtures)+'\n')
    compact={k:{kk:vv for kk,vv in report[k].items() if kk not in ['cases','by_scenario']} for k in ['pytorch_selected','pytorch_0_5','int8_selected']}
    print(json.dumps(compact,indent=2));return report


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run');p.add_argument('output');a=p.parse_args();evaluate(a.run,a.output)

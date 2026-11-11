"""Shared dataset encoding, inference, conservative composition and metrics."""
import json
import math
import time
from collections import Counter, defaultdict
from pathlib import Path
from corpus import LABELS, digest, load_data, queries


def verify_manifest(data_dir):
    data_dir=Path(data_dir)
    manifest=json.loads((data_dir/"manifest.json").read_text())
    for name,sha in manifest["files"].items():
        if Path(name).name!=name or digest((data_dir/name).read_bytes())!=sha:
            raise ValueError(f"Corpus changed: {name}; run prepare.py and record a new experiment")
    if digest(manifest["files"])!=manifest["corpus_sha256"]: raise ValueError("Manifest digest mismatch")
    return manifest


def encode(tokenizer, query, max_length):
    encoded=tokenizer(query["context"],query["utterance"],truncation=False)
    if len(encoded["input_ids"])>max_length:
        raise ValueError(f'Input exceeds {max_length} tokens: {query["example_id"]}. No silent truncation.')
    return encoded


def expand(recs, rows, split):
    return [q for r in rows if r["split"]==split for q in queries(recs[r["recipe_id"]],r)]


def allowed(task):return list(range(3,8)) if task=="intent" else list(range(3))


def records_from_logits(items, logits):
    records=[]
    for item,values in zip(items,logits):
        indices=allowed(item["task"]);maximum=max(float(values[i]) for i in indices)
        exps=[math.exp(float(values[i])-maximum) for i in indices];total=sum(exps)
        winner=max(range(len(indices)),key=lambda i:exps[i])
        records.append({**item,"prediction":LABELS[indices[winner]],"confidence":exps[winner]/total})
    return records


def infer(model, tokenizer, items, device, batch_size=16, max_length=512, deadline=None):
    import torch
    records=[];model.eval();lengths=[]
    start=time.monotonic()
    with torch.inference_mode():
        for offset in range(0,len(items),batch_size):
            if deadline and time.monotonic()>=deadline: raise TimeoutError("Evaluation time budget exhausted")
            batch=items[offset:offset+batch_size]
            encoded=[encode(tokenizer,q,max_length) for q in batch];lengths.extend(len(e["input_ids"]) for e in encoded)
            inputs={k:v.to(device) for k,v in tokenizer.pad(encoded,padding=True,return_tensors="pt").items()}
            logits=model(**inputs).logits.float().cpu().tolist()
            records.extend(records_from_logits(batch,logits))
    return records,{"seconds":time.monotonic()-start,"queries":len(items),"max_tokens":max(lengths,default=0)}


def compose(records, threshold):
    intent=next(r for r in records if r["task"]=="intent")
    kind=intent["prediction"] if intent["confidence"]>=threshold else "clarify"
    changes=[]
    if kind=="report":
        for r in records:
            if r["task"]=="action" and r["confidence"]>=threshold and r["prediction"] in ["done","not_done"]:
                changes.append({"actionId":r["action_id"],"done":r["prediction"]=="done"})
        if not changes:kind="clarify"
    # This is a classifier diagnostic, NOT the app's evidence-validated proposal.
    return {"intent":kind,"changes":changes,"requiresReview":True}


def effect_map(changes):return {c["actionId"]:c["done"] for c in changes}


def infer_onnx(filename, tokenizer, items, batch_size=16, max_length=512):
    import numpy as np
    import onnxruntime as ort
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    session=ort.InferenceSession(str(filename),sess_options=options,providers=["CPUExecutionProvider"])
    start=time.monotonic();records=[];lengths=[]
    for offset in range(0,len(items),batch_size):
        batch=items[offset:offset+batch_size]
        encoded=[encode(tokenizer,q,max_length) for q in batch];lengths.extend(len(e["input_ids"]) for e in encoded)
        inputs={k:v.astype(np.int64) for k,v in tokenizer.pad(encoded,padding=True,return_tensors="np").items()}
        records.extend(records_from_logits(batch,session.run(None,inputs)[0].tolist()))
    return records,{"seconds":time.monotonic()-start,"queries":len(items),"max_tokens":max(lengths,default=0)}


def score(rows, records, threshold):
    grouped=defaultdict(list)
    for r in records:grouped[r["example_id"]].append(r)
    exact=0;false_updates=0;true_updates=0;expected_updates=0;proposed_updates=0;abstained=0;cases=[];buckets=defaultdict(lambda:Counter(total=0,exact=0,false_updates=0))
    for row in rows:
        actual=compose(grouped[row["id"]],threshold)
        predicted=effect_map(actual["changes"]);gold=effect_map(row["gold"]["changes"])
        correct=actual["intent"]==row["gold"]["intent"] and predicted==gold
        bad=sum(a not in gold or gold[a]!=value for a,value in predicted.items())
        good=sum(a in gold and gold[a]==value for a,value in predicted.items())
        false_updates+=bad;true_updates+=good;proposed_updates+=len(predicted);expected_updates+=len(gold)
        exact+=int(correct);abstained+=int(actual["intent"]=="clarify")
        bucket=buckets[row["scenario"]];bucket.update(total=1,exact=int(correct),false_updates=bad)
        cases.append({"id":row["id"],"utterance":row["utterance"],"gold":row["gold"],"actual":actual,"exact":correct,"false_updates":bad})
    return {"threshold":threshold,"examples":len(rows),"exact_proposals":exact,"exact_rate":exact/max(1,len(rows)),"false_updates":false_updates,"proposed_updates":proposed_updates,"expected_updates":expected_updates,"update_precision":true_updates/proposed_updates if proposed_updates else None,"update_recall":true_updates/max(1,expected_updates),"clarifications":abstained,"by_scenario":dict(buckets),"cases":cases}


def calibrate(rows, records):
    candidates=[score(rows,records,t) for t in [.5,.6,.7,.8,.85,.9,.95,.99,1.0]]
    safe=[c for c in candidates if c["false_updates"]==0]
    best=max(safe,key=lambda c:(c["exact_rate"],c["update_recall"],-c["threshold"]))
    return best,{"selection":"Validation only: maximize exact proposal rate, then recall, among thresholds with zero observed false updates. This is not a statistical safety guarantee.","candidates":[{k:v for k,v in c.items() if k not in ["cases","by_scenario"]} for c in candidates]}

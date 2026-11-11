"""One frozen held-out evaluation after training/validation threshold selection."""
import os
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY","1")
import argparse
import json
from pathlib import Path
from corpus import ROOT,LABELS,load_data,digest
from engine import verify_manifest,expand,infer,infer_onnx,score


def evaluate(run, data, split="test", onnx=False):
    import torch
    from transformers import AutoTokenizer,AutoModelForSequenceClassification
    run=Path(run);manifest=verify_manifest(data)
    config=json.loads((run/"run-config.json").read_text());decision=json.loads((run/"decision.json").read_text())
    if config["corpus_sha256"]!=manifest["corpus_sha256"] or decision["corpus_sha256"]!=manifest["corpus_sha256"]:raise ValueError("Corpus changed after training")
    recs,rows=load_data(Path(data));selected=[r for r in rows if r["split"]==split]
    torch.set_num_threads(min(4,os.cpu_count() or 1))
    if onnx:
        artifact=run/"onnx/model.int8.onnx";export=json.loads((run/"onnx/export-report.json").read_text())
        if digest(artifact.read_bytes())!=export["files"]["model.int8.onnx"]["sha256"]:raise ValueError("ONNX artifact changed")
        tokenizer=AutoTokenizer.from_pretrained(run/"onnx/tokenizer",local_files_only=True)
        records,timing=infer_onnx(artifact,tokenizer,expand(recs,rows,split,config['input_contract']),max_length=config["max_length"])
    else:
        model=AutoModelForSequenceClassification.from_pretrained(run/"model",local_files_only=True,attn_implementation="eager")
        tokenizer=AutoTokenizer.from_pretrained(run/"model",local_files_only=True)
        device="cuda" if torch.cuda.is_available() else "cpu";model.to(device)
        records,timing=infer(model,tokenizer,expand(recs,rows,split,config['input_contract']),device,max_length=config["max_length"])
    metrics=score(selected,records,decision["threshold"])
    report={"split":split,"threshold_selected_on":"validation","metrics":metrics,"timing":timing,"corpus_sha256":manifest["corpus_sha256"],"data_review":manifest["human_review"],"production_ready":False,"note":"Synthetic fixture evaluation only. Repeated tuning on test invalidates its held-out role. Browser and physical-device quality/latency are separate gates."}
    report["engine"]="native_ort_int8" if onnx else "pytorch"
    (run/f'evaluation-{split}{"-int8" if onnx else ""}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    summary={k:v for k,v in metrics.items() if k not in ["cases","by_scenario"]};print(json.dumps(summary,indent=2));return report

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("run");p.add_argument("--data",default=str(ROOT/"data"));p.add_argument("--split",choices=["validation","test"],default="test");p.add_argument("--onnx",action="store_true")
    a=p.parse_args();evaluate(a.run,a.data,a.split,a.onnx)

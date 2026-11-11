"""Bounded single-device fine-tuning. No remote launch, telemetry or Hub push."""
import os
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY","1")
os.environ.setdefault("TOKENIZERS_PARALLELISM","false")
import argparse
import json
import random
import time
from collections import Counter
from pathlib import Path
from corpus import ROOT,LABELS,MODEL_ID,MODEL_REVISION,digest,load_data
from engine import verify_manifest,expand,encode,allowed,infer,calibrate


def train(args, on_checkpoint=None):
    import torch
    from transformers import AutoTokenizer,AutoModelForSequenceClassification
    started=time.monotonic();deadline=started+args.max_seconds
    torch.set_num_threads(min(4,os.cpu_count() or 1));random.seed(args.seed);torch.manual_seed(args.seed)
    if torch.cuda.is_available():torch.cuda.manual_seed_all(args.seed)
    device="cuda" if torch.cuda.is_available() else "cpu"
    if args.require_gpu and device!="cuda":raise RuntimeError("GPU requested but unavailable; no silent CPU training")
    manifest=verify_manifest(args.data);recs,rows=load_data(Path(args.data))
    config={"model":MODEL_ID,"revision":MODEL_REVISION,"labels":LABELS,"seed":args.seed,"max_length":args.max_length,"batch_size":args.batch_size,"learning_rate":args.lr,"max_steps":args.max_steps,"corpus_sha256":manifest["corpus_sha256"],"input_contract":1,"source_sha256":digest({name:digest((ROOT/name).read_bytes()) for name in ["corpus.py","engine.py","train.py"]})}
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    config_path=output/"run-config.json"
    previous=json.loads(config_path.read_text()) if config_path.exists() else None
    if previous and previous!=config:raise ValueError("Output belongs to a different config/corpus; use a new output directory")
    if previous and not args.resume:raise ValueError("Existing run: choose --resume or a fresh output directory")
    config_path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+"\n")
    tokenizer=AutoTokenizer.from_pretrained(MODEL_ID,revision=MODEL_REVISION,trust_remote_code=False)
    model=AutoModelForSequenceClassification.from_pretrained(MODEL_ID,revision=MODEL_REVISION,num_labels=len(LABELS),id2label=dict(enumerate(LABELS)),label2id={l:i for i,l in enumerate(LABELS)},use_safetensors=True,trust_remote_code=False,attn_implementation="eager").to(device)
    optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=.01)
    items=expand(recs,rows,"train");encoded=[encode(tokenizer,q,args.max_length) for q in items]
    counts=Counter(q["label"] for q in items)
    weights=torch.tensor([1/(counts[l]**.5) for l in LABELS],device=device);weights/=weights.mean()
    rng=random.Random(args.seed);order=list(range(len(items)));rng.shuffle(order);cursor=0;step=0;losses=[]
    checkpoint=output/"resume.pt"
    if args.resume:
        if not checkpoint.exists():raise ValueError("No checkpoint to resume")
        state=torch.load(checkpoint,map_location=device,weights_only=True)
        model.load_state_dict(state["model"]);optimizer.load_state_dict(state["optimizer"])
        step=state["step"];cursor=state["cursor"];order=state["order"];rng.setstate(state["random_state"]);torch.set_rng_state(state["torch_rng"].cpu())
        if device=="cuda" and state.get("cuda_rng") is not None:torch.cuda.set_rng_state(state["cuda_rng"].cpu())
    def save():
        state={"model":model.state_dict(),"optimizer":optimizer.state_dict(),"step":step,"cursor":cursor,"order":order,"random_state":rng.getstate(),"torch_rng":torch.get_rng_state(),"cuda_rng":torch.cuda.get_rng_state() if device=="cuda" else None}
        temporary=output/"resume.pt.partial";torch.save(state,temporary);temporary.replace(checkpoint)
        if on_checkpoint:on_checkpoint()
    if device=="cuda":torch.cuda.reset_peak_memory_stats()
    try:
        while step<args.max_steps and time.monotonic()<deadline:
            if cursor>=len(order):rng.shuffle(order);cursor=0
            indices=order[cursor:cursor+args.batch_size]
            inputs={k:v.to(device) for k,v in tokenizer.pad([encoded[i] for i in indices],padding=True,return_tensors="pt").items()}
            targets=torch.tensor([LABELS.index(items[i]["label"]) for i in indices],device=device)
            mask=torch.full((len(indices),len(LABELS)),-1e9,device=device)
            for j,i in enumerate(indices):mask[j,allowed(items[i]["task"])]=0
            model.train();optimizer.zero_grad(set_to_none=True)
            loss=torch.nn.functional.cross_entropy(model(**inputs).logits+mask,targets,weight=weights)
            if not torch.isfinite(loss):raise RuntimeError("Non-finite loss")
            loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);optimizer.step();step+=1;cursor+=len(indices)
            losses.append(float(loss.detach().cpu()))
            if step%10==0:print(json.dumps({"step":step,"loss":losses[-1],"elapsed_seconds":time.monotonic()-started}),flush=True)
            if step%args.save_every==0:save()
        save();model.save_pretrained(output/"model",safe_serialization=True);tokenizer.save_pretrained(output/"model")
        report={"device":device,"steps":step,"requested_steps":args.max_steps,"seconds":time.monotonic()-started,"last_loss":losses[-1] if losses else None,"gpu_peak_allocated_bytes":torch.cuda.max_memory_allocated() if device=="cuda" else None,"gpu_name":torch.cuda.get_device_name() if device=="cuda" else None,"corpus_sha256":manifest["corpus_sha256"],"data_review":manifest["human_review"],"production_ready":False,"max_seconds":args.max_seconds,"versions":{"torch":torch.__version__,"python":__import__("platform").python_version(),"transformers":__import__("transformers").__version__},"note":"Step/wall limits are compute controls, not a provider billing cap. No paid run is launched by this script."}
        if step==args.max_steps and time.monotonic()<deadline:
            valid=[r for r in rows if r["split"]=="validation"]
            try:
                records,timing=infer(model,tokenizer,expand(recs,rows,"validation"),device,args.batch_size,args.max_length,deadline)
                summary,search=calibrate(valid,records)
                report["validation"]={k:v for k,v in summary.items() if k!="cases"};report["validation_timing"]=timing
                (output/"validation.json").write_text(json.dumps({"metrics":summary,"threshold_selection":search},ensure_ascii=False,indent=2))
                (output/"decision.json").write_text(json.dumps({"threshold":summary["threshold"],"selected_on":"validation","corpus_sha256":manifest["corpus_sha256"],"production_ready":False},indent=2))
                report["status"]="pilot_complete"
            except TimeoutError:report["status"]="saved_before_validation_timeout"
        else:report["status"]="saved_at_time_limit"
        (output/"training-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
        if on_checkpoint:on_checkpoint()
        print(json.dumps(report,ensure_ascii=False,indent=2));return report
    except BaseException as error:
        # Preserve the last complete checkpoint, never serialize half an optimizer step.
        (output/"failure.json").write_text(json.dumps({"step":step,"error":type(error).__name__,"resume_available":checkpoint.exists()},indent=2))
        if on_checkpoint:on_checkpoint()
        raise


def parser():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data",default=str(ROOT/"data"));p.add_argument("--output",default=str(ROOT/"runs/pilot"))
    p.add_argument("--max-steps",type=int,default=200);p.add_argument("--max-seconds",type=int,default=600)
    p.add_argument("--batch-size",type=int,default=8);p.add_argument("--max-length",type=int,default=512)
    p.add_argument("--lr",type=float,default=3e-5);p.add_argument("--seed",type=int,default=42)
    p.add_argument("--save-every",type=int,default=50);p.add_argument("--resume",action="store_true");p.add_argument("--require-gpu",action="store_true")
    return p

if __name__=="__main__":
    args=parser().parse_args()
    if not (1<=args.max_steps<=5000 and 10<=args.max_seconds<=3600 and 1<=args.batch_size<=32 and 32<=args.max_length<=512 and args.save_every>=1):raise SystemExit("Invalid bounded training settings")
    train(args)

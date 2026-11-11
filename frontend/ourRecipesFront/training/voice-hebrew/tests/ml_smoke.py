"""Opt-in real CPU smoke: pinned weights, forced stop, resume equivalence.
Run after installing CPU torch + requirements.txt. No GPU/cloud job is launched.
"""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from corpus import digest
from train import parser,train


def main(output, input_contract=1, sampling='original'):
    output=Path(output)
    if output.exists():raise ValueError("Use a fresh smoke directory")
    output.mkdir(parents=True)
    def args(folder,resume=False):
        values=["--output",str(output/folder),"--max-steps","2","--max-seconds","600","--batch-size","2","--save-every","1",'--input-contract',str(input_contract),'--sampling',sampling]
        if resume:values.append("--resume")
        return parser().parse_args(values)
    full=train(args("full"))
    stopped=False
    def stop_once():
        nonlocal stopped
        if not stopped:
            stopped=True;raise RuntimeError("injected stop after a complete checkpoint")
    try:train(args("resumed"),on_checkpoint=stop_once)
    except RuntimeError as e:
        if "injected stop" not in str(e):raise
    else:raise AssertionError("Stop injection did not happen")
    resumed=train(args("resumed",True))
    a=digest((output/"full/model/model.safetensors").read_bytes())
    b=digest((output/"resumed/model/model.safetensors").read_bytes())
    if a!=b:raise AssertionError("Resumed weights differ from uninterrupted CPU run")
    proof={"scope":"Actual CPU training plumbing only, two steps; not a Hebrew accuracy result", "full_steps":full["steps"],"resumed_steps":resumed["steps"],"weights_sha256":a,"resume_weights_identical":a==b,"device":full["device"],"versions":full["versions"],"source_sha256":json.loads((output/"full/run-config.json").read_text())["source_sha256"],"corpus_sha256":full["corpus_sha256"]}
    (output/"proof.json").write_text(json.dumps(proof,indent=2)+"\n");print(json.dumps(proof,indent=2))
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("output");p.add_argument('--input-contract',type=int,choices=[1,2],default=1);p.add_argument('--sampling',choices=['original','balanced-task'],default='original')
    a=p.parse_args();main(a.output,a.input_contract,a.sampling)

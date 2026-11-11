"""Portable ONNX candidate with native parity and browser-ready tensor fixtures."""
import os
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY","1")
import argparse
import json
import shutil
from pathlib import Path
from corpus import ROOT,LABELS,digest,load_data
from engine import verify_manifest,expand,encode


def export(run, data):
    import numpy as np
    import torch
    import onnxruntime as ort
    from onnxruntime.quantization import quantize_dynamic,QuantType
    from transformers import AutoTokenizer,AutoModelForSequenceClassification
    torch.set_num_threads(min(4,os.cpu_count() or 1))
    run=Path(run);output=run/"onnx";output.mkdir(exist_ok=True)
    config=json.loads((run/"run-config.json").read_text());manifest=verify_manifest(data)
    if config["corpus_sha256"]!=manifest["corpus_sha256"]:raise ValueError("Export corpus mismatch")
    tokenizer=AutoTokenizer.from_pretrained(run/"model",local_files_only=True)
    model=AutoModelForSequenceClassification.from_pretrained(run/"model",local_files_only=True,attn_implementation="eager").eval()
    class Wrapper(torch.nn.Module):
        def __init__(self, base):super().__init__();self.base=base
        def forward(self,input_ids,attention_mask,token_type_ids):
            return self.base(input_ids=input_ids,attention_mask=attention_mask,token_type_ids=token_type_ids).logits
    wrapper=Wrapper(model).eval()
    recs,rows=load_data(Path(data));items=expand(recs,rows,"validation",config['input_contract'])
    # Different batch/sequence sizes validate dynamic axes. Never tune on test.
    batches=[items[:1],items[5:7],items[10:13],items[25:29]]
    tensors=[tokenizer.pad([encode(tokenizer,q,config["max_length"]) for q in batch],padding=True,return_tensors="pt") for batch in batches]
    names=["input_ids","attention_mask","token_type_ids"]
    with torch.inference_mode():
        torch.onnx.export(wrapper,tuple(tensors[0][k] for k in names),output/"model.onnx",input_names=names,output_names=["logits"],dynamic_axes={**{k:{0:"batch",1:"sequence"} for k in names},"logits":{0:"batch"}},opset_version=17,dynamo=False)
    # Reduced range avoids architecture-dependent integer saturation in some
    # native GEMM kernels. Validate against WASM rather than assuming parity.
    quantize_dynamic(str(output/"model.onnx"),str(output/"model.int8.onnx"),weight_type=QuantType.QInt8,reduce_range=True,op_types_to_quantize=["MatMul","Gemm","Gather"])
    checks=[];fixtures=[]
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    sessions={name:ort.InferenceSession(str(output/name),sess_options=options,providers=["CPUExecutionProvider"]) for name in ["model.onnx","model.int8.onnx"]}
    for batch,inputs in zip(batches,tensors):
        arrays={k:inputs[k].numpy().astype(np.int64) for k in names}
        with torch.inference_mode():expected=wrapper(**inputs).numpy()
        outputs={name:s.run(None,arrays)[0] for name,s in sessions.items()}
        if not np.allclose(expected,outputs["model.onnx"],atol=1e-4,rtol=1e-3):raise ValueError("FP32 export parity failed")
        for name,actual in outputs.items():
            # Apply the same task-specific masks as production diagnostics.
            flips=0
            for q,e,a in zip(batch,expected,actual):
                valid=list(range(3,8)) if q["task"]=="intent" else list(range(3))
                flips+=int(np.argmax(e[valid])!=np.argmax(a[valid]))
            checks.append({"file":name,"batch":len(batch),"sequence":inputs["input_ids"].shape[1],"max_abs_logit_error":float(np.max(np.abs(expected-actual))),"label_flips":flips})
        threshold=json.loads((run/"decision.json").read_text())["threshold"] if (run/"decision.json").exists() else 1.0
        fixtures.append({"inputs":{k:{"dims":list(v.shape),"data":v.flatten().tolist()} for k,v in arrays.items()},"expected":outputs["model.int8.onnx"].tolist(),"fp32_expected":outputs["model.onnx"].tolist(),"tasks":[q["task"] for q in batch],"threshold":threshold})
    tokenizer.save_pretrained(output/"tokenizer")
    if (run/"decision.json").exists():shutil.copyfile(run/"decision.json",output/"decision.json")
    (output/"browser-fixtures.json").write_text(json.dumps(fixtures))
    report={"model":config["model"],"revision":config["revision"],"input_contract":config['input_contract'],"labels":LABELS,"max_length":config["max_length"],"source_license":"CC-BY-4.0; Dicta. Fine-tuned classifier and ONNX/quantization are modifications.","source_url":"https://huggingface.co/"+config["model"]+"/tree/"+config["revision"],"license_url":"https://creativecommons.org/licenses/by/4.0/","files":{name:{"bytes":(output/name).stat().st_size,"sha256":digest((output/name).read_bytes())} for name in sessions},"native_parity":checks,"production_ready":False,"browser_tested":False,"physical_device_tested":False,"note":"INT8 parity checks cover only these tensor fixtures. Full semantic evaluation must be repeated for the quantized artifact. Browser fixtures use Python tokenization; browser tokenizer parity is untested."}
    (output/"export-report.json").write_text(json.dumps(report,indent=2)+"\n")
    (output/"ATTRIBUTION.txt").write_text(f'Derived from {report["source_url"]}\nDictaBERT-tiny by Dicta, CC-BY-4.0: {report["license_url"]}\nChanges: supervised cooking-status classifier, ONNX export and INT8 quantization by OurRecipes.\nExperimental; no production-quality claim.\n')
    print(json.dumps(report,indent=2));return report

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("run");p.add_argument("--data",default=str(ROOT/"data"));a=p.parse_args();export(a.run,a.data)

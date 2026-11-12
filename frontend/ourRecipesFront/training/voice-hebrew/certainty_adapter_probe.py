import json,torch
from copy import deepcopy
from transformers import AutoModelForTokenClassification,AutoTokenizer
from certainty_adapter import install,disabled
from certainty_train import BASE
from corpus import ROOT,load_data,digest
from span_pilot import encode
torch.set_num_threads(2)
model=AutoModelForTokenClassification.from_pretrained(BASE/'model',local_files_only=True,attn_implementation='eager').eval()
tok=AutoTokenizer.from_pretrained(BASE/'model',local_files_only=True)
r,rows=load_data(ROOT/'runs/state-v13-preflight/shared');row=deepcopy(next(x for x in rows if x['split']=='validation'));row['gold']={'intent':'clarify','changes':[]}
items=encode(tok,r[row['recipe_id']],row,'context-joint-v3');inputs=tok.pad([x['inputs'] for x in items],padding=True,return_tensors='pt')
with torch.no_grad():before=model(**inputs).logits.clone()
info=install(model,rank=8,last_layers=2);model.eval()
with torch.no_grad():
 zero=model(**inputs).logits.clone()
 with disabled(model):off=model(**inputs).logits.clone()
assert torch.equal(before,zero) and torch.equal(before,off)
p={'scope':'Actual adapted185M BERT CPU mechanics only; no semantic quality, labels, fresh test or adapter training','full_model':info,'known_validation_queries':len(items),'gold_removed':True,'zero_initialized_logits_bitwise_equal':True,'disabled_logits_bitwise_equal':True,'adapter_quality_trained':False,'tiny_tests':'Two-step real Tiny BERT gradients through differentiable pooling, isolated legacy path and payload roundtrip; not Hebrew quality','source_sha256':digest((ROOT/'certainty_adapter.py').read_bytes()),'physical_device_tested':False}
(ROOT/'verification/certainty-adapter-mechanics-20261112.json').write_text(json.dumps(p,indent=2)+'\n');print(json.dumps(p))

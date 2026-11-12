"""Capacity comparison on consumed development/calibration only.
Uses the byte-identical V16 instruction/examples/scorer with a larger public model.
Never opens any fresh set, trains, generates cooking advice or becomes a product.
"""
import argparse,hashlib,json,time
from pathlib import Path
import torch
from corpus import ROOT,digest
from scope_v13_stance import calibrate,metrics
from scope_v16_teacher import DATA,examples,score
PLAN=ROOT/'verification/scope-v17-capacity-plan-20261112.json'


def verify_weight_files(snapshot,weights):
 proof=[]
 for item in weights:
  path=Path(snapshot)/item['name']
  with path.open('rb') as file:actual=hashlib.file_digest(file,'sha256').hexdigest()
  if path.stat().st_size!=item['bytes'] or actual!=item['sha256']:raise ValueError('Weight integrity failed: '+item['name'])
  proof.append({**item,'verified':True})
 return proof


def run(output):
 import transformers
 from transformers import AutoTokenizer,AutoModelForCausalLM
 from huggingface_hub import snapshot_download
 torch.set_num_threads(2);torch.manual_seed(0)
 plan=json.loads(PLAN.read_text())
 for name,sha in plan['source_sha256'].items():assert digest((ROOT/name).read_bytes())==sha,name
 assert digest(DATA.read_bytes())==plan['data_sha256']
 if not torch.cuda.is_available() or 'T4' not in torch.cuda.get_device_name(0):raise ValueError('Actual authorized T4 required')
 output=Path(output);output.mkdir(exist_ok=False);(output/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n');began=time.monotonic()
 (output/'progress.json').write_text(json.dumps({'phase':'download','expected_weight_bytes':sum(w['bytes'] for w in plan['weights'])})+'\n')
 snapshot=Path(snapshot_download(repo_id=plan['repo'],revision=plan['revision'],allow_patterns=['*.json','*.txt','*.jinja','*.safetensors','README.md'],token=False))
 weights=verify_weight_files(snapshot,plan['weights'])
 assert digest((snapshot/'tokenizer_config.json').read_bytes())==plan['tokenizer_config_sha256']
 download_seconds=time.monotonic()-began
 tok=AutoTokenizer.from_pretrained(snapshot,trust_remote_code=False,local_files_only=True);tok.padding_side='left';tok.pad_token=tok.pad_token or tok.eos_token
 assert digest(tok.chat_template.encode())==plan['template_sha256']
 model=AutoModelForCausalLM.from_pretrained(snapshot,torch_dtype=torch.float16,attn_implementation='sdpa',trust_remote_code=False,local_files_only=True).to('cuda').eval();torch.cuda.reset_peak_memory_stats()
 data=json.loads(DATA.read_text())['splits'];shots=examples(data['train']);scores={}
 for split in ('dev','calibration'):
  split_output=output/split;split_output.mkdir();result=score(model,tok,data[split],shots,split_output);scores[split]=[r['allow_score'] for r in result['records']]
  (output/f'{split}-raw.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 policy=calibrate(data['calibration'],scores['calibration']);dev=metrics(data['dev'],scores['dev'],policy['threshold'])
 proof={'study':plan['study'],'repo':plan['repo'],'revision':plan['revision'],'weights':weights,'license':plan['license'],'training_performed':False,'device':torch.cuda.get_device_name(0),'dtype':str(next(model.parameters()).dtype),'torch':torch.__version__,'transformers':transformers.__version__,'shots':shots,'calibration':policy,'dev_at_calibrated_threshold':dev,'development_gate_passed':policy['metrics']['passed'] and dev['passed'],'fresh_test_inferred':False,'natural_test_inferred':False,'original120_and_v5fresh480_inferred':False,'sets_inferred':['dev','calibration'],'human_reviewed':False,'recorded_speech':False,'physical_device_tested':False,'scope':'Larger teacher capacity diagnostic only. No composed recipe pipeline,distillation,product selection,or independent test claim.','download_and_verify_seconds':download_seconds,'peak_cuda_allocated_bytes':torch.cuda.max_memory_allocated(),'seconds':time.monotonic()-began}
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k!='shots'},ensure_ascii=False),flush=True)
 return proof


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');args=parser.parse_args();run(args.output)

"""Compare rendered frozen text prompts, not just template-source checksums.
This is Python Jinja rendering parity,not native C++ tokenizer or logit parity.
"""
import hashlib,json,subprocess,urllib.request
from pathlib import Path
from transformers.utils.chat_template_utils import _compile_jinja_template
ROOT=Path(__file__).resolve().parent
program="import {cases,modes,prompt} from './tiny_recipe_cases.mjs';import * as controls from './tiny_recipe_controls.mjs';console.log(JSON.stringify([...modes.flatMap(m=>cases.map(c=>({id:m+':'+c.id,messages:prompt(c,m)}))),...controls.cases.map(c=>({id:'control:'+c.id,messages:controls.prompt(c)}) )]));"
rows=json.loads(subprocess.check_output(['node','--input-type=module','-e',program],cwd=ROOT,text=True));proof={}
models={'qwen35-08':('Qwen/Qwen3.5-0.8B','2fc06364715b967f1860aea9cf38778875588b17'),'qwen3-06':('Qwen/Qwen3-0.6B','c1899de289a04d12100db370d81485cdf75e47ca')}
for name,(repo,rev) in models.items():
 result=json.loads((ROOT/'runs/tiny-recipe-browser'/name/'result.json').read_text());embedded=result['load']['template']
 with urllib.request.urlopen(f'https://huggingface.co/{repo}/resolve/{rev}/tokenizer_config.json',timeout=25) as response:official=json.load(response)['chat_template']
 a,b=map(_compile_jinja_template,(embedded,official));checks=[]
 for row in rows:
  args={'messages':row['messages'],'add_generation_prompt':True,'enable_thinking':False,'tools':None,'eos_token':'<|im_end|>','bos_token':''};left=a.render(**args);right=b.render(**args);checks.append({'id':row['id'],'match':left==right,'rendered_sha256':hashlib.sha256(left.encode()).hexdigest()})
 proof[name]={'official_repo':repo,'official_revision':rev,'embedded_template_sha256':hashlib.sha256(embedded.encode()).hexdigest(),'official_template_sha256':hashlib.sha256(official.encode()).hexdigest(),'source_string_match':embedded==official,'render_checks':checks,'all_frozen_text_prompts_render_identically':all(c['match'] for c in checks),'method':'transformers4.48 Python Jinja renderer,24frozen text message arrays,no tools/images. No native C++ rendering,tokenizer,logit or physical-device parity claim.'}
(ROOT/'verification/tiny-recipe-template-audit-20261113.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({name:{'checks':len(p['render_checks']),'all_match':p['all_frozen_text_prompts_render_identically']} for name,p in proof.items()}))

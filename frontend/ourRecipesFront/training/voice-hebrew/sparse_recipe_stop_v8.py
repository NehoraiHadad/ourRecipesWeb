"""Use official model stop IDs consistently in generation and grammar."""
import hashlib
import json
from pathlib import Path
import statistics
import sys
import time
from sparse_recipe_diagnosis_v7 import messages
from sparse_recipe_reference_v6 import schema, dump
from sparse_recipe_v3 import aggregate

ROOT=Path(__file__).resolve().parent
PLAN='verification/sparse-recipe-plan-v8-20261116.json'


def stop_ids(value):
    values=[value] if type(value) is int else value
    if not isinstance(values,list) or not values or any(type(v) is not int or v<0 for v in values) or len(set(values))!=len(values):
        raise ValueError('Invalid official stop configuration')
    return values.copy()


def set_grammar_stops(token_data,stops):
    token_data.eos_token_id=stop_ids(stops)
    return token_data


def check_stopped(tokens,stops):
    positions=[i for i,t in enumerate(tokens) if t in stops]
    if positions and positions!=[len(tokens)-1]:raise ValueError('Generated beyond official stop token')
    return tokens[-1] if positions else None


def run(output):
    import torch
    from transformers import AutoTokenizer,AutoModelForCausalLM
    from transformers.utils.hub import cached_file
    from lmformatenforcer import JsonSchemaParser
    from lmformatenforcer.integrations.transformers import build_token_enforcer_tokenizer_data,build_transformers_prefix_allowed_tokens_fn
    plan=json.loads((ROOT/PLAN).read_text())
    for name,expected in {**plan['source_sha256'],**plan['artifact_sha256']}.items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,name
    data=json.loads((ROOT/plan['data_file']).read_text());output=Path(output);output.mkdir(exist_ok=False)
    spec=plan['model'];tokenizer=AutoTokenizer.from_pretrained(spec['repo'],revision=spec['revision'],trust_remote_code=False)
    model=AutoModelForCausalLM.from_pretrained(spec['repo'],revision=spec['revision'],torch_dtype=torch.float16,
        device_map={'':0},trust_remote_code=False,attn_implementation='sdpa');model.eval();model.config.use_cache=True
    stops=stop_ids(model.generation_config.eos_token_id);assert stops==plan['official_stops']
    for name,expected in [('model.safetensors',spec['weight_sha256']),('generation_config.json',plan['generation_config_sha256'])]:
        with Path(cached_file(spec['repo'],name,revision=spec['revision'])).open('rb') as stream:
            assert hashlib.file_digest(stream,'sha256').hexdigest()==expected
    token_data=set_grammar_stops(build_token_enforcer_tokenizer_data(tokenizer),stops)
    reports={}

    def infer(rows,route,plain=False,save_as=None):
        name=save_as or route
        records=[]
        for i,row in enumerate(rows):
            conversation=[{'role':'user','content':row['utterance']}] if plain else messages(row,route)
            text=tokenizer.apply_chat_template(conversation,tokenize=False,add_generation_prompt=True,enable_thinking=False)
            inputs=tokenizer(text,add_special_tokens=False,return_tensors='pt').to('cuda');limit=24 if plain else 96
            assert inputs['input_ids'].shape[1]+limit<=1024
            kwargs={}
            if route in ('grammar','fewshot','expanded-fewshot'):
                kwargs['prefix_allowed_tokens_fn']=build_transformers_prefix_allowed_tokens_fn(token_data,JsonSchemaParser(schema(row['input'])))
            torch.cuda.synchronize();began=time.monotonic()
            with torch.inference_mode():
                generated=model.generate(**inputs,max_new_tokens=limit,do_sample=False,temperature=None,top_k=None,top_p=None,
                    pad_token_id=model.generation_config.pad_token_id,eos_token_id=stops,**kwargs)
            torch.cuda.synchronize();seconds=time.monotonic()-began
            tokens=generated[0,inputs['input_ids'].shape[1]:].tolist()
            ended=check_stopped(tokens,stops)
            records.append({'id':row['id'],'text':tokenizer.decode(tokens,skip_special_tokens=True),'tokens':tokens,
                'seconds':seconds,'stop_id':ended,'prompt_tokens':inputs['input_ids'].shape[1],'hit_limit':len(tokens)==limit})
            dump(output/'progress.json',{'phase':'generation','route':name,'completed':i+1,'total':len(rows)})
        metrics=None if plain else aggregate(rows,[r['text'] for r in records])[0]
        report={'route':route,'records':records,'metrics':metrics,'median_generation_seconds':statistics.median(r['seconds'] for r in records)}
        dump(output/(name+'.json'),report);reports[name]=metrics
        return report

    for route in ['plain','free','grammar','fewshot']:
        infer(data['plain'] if route=='plain' else data['language'],route,plain=route=='plain')
    f,g=reports['fewshot'],reports['grammar'];gate=plan['interest_gate']
    interest=f['exact']>=gate['exact_min'] and f['required_changes_correct']>=gate['changes_min'] and f['critical_wrong_fact_cases']==0 and f['exact']-g['exact']>=gate['gain_min']
    expanded=None
    if interest:
        expanded_data=json.loads((ROOT/plan['expanded_data_file']).read_text())
        # Same fewshot block, not a new instruction variant.
        rows=expanded_data['hard']+expanded_data['regression']
        report=infer(rows,'fewshot',save_as='expanded')
        lookup={r['id']:r['text'] for r in report['records']}
        expanded={k:aggregate(v,[lookup[r['id']] for r in v])[0] for k,v in expanded_data.items()}
    dump(output/'result.json',{'metrics':reports,'interest_gate_passed':interest,'expanded':expanded,
        'tokenizer_default_eos':tokenizer.eos_token_id,'official_stops':stops,'grammar_stops':token_data.eos_token_id,
        'peak_allocated_bytes':torch.cuda.max_memory_allocated(),'training_performed':False,'product_promotion':False,'scope':plan['scope']})
    dump(output/'progress.json',{'phase':'complete'})


if __name__=='__main__':run(sys.argv[1])

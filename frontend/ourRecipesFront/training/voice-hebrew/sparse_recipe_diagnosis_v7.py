"""Bounded teacher anomaly diagnosis; no training or independent quality claim."""
import gc
import hashlib
import json
from pathlib import Path
import sys
import time

from sparse_recipe_data_v4 import messages as original_messages, SYSTEM
from sparse_recipe_reference_v6 import schema, dump
from sparse_recipe_v3 import aggregate

ROOT = Path(__file__).resolve().parent
PLAN = 'verification/sparse-recipe-plan-v7-20261116.json'
EXAMPLES = [
    ('חתכתי את התפוח', {'intent': 'report', 'facts': [{'action': 'd1', 'status': 'done'}], 'clarify': []}),
    ('התפוח חתוך רק בחלקו; את היוגורט טרם הוספתי', {'intent': 'report', 'facts': [{'action': 'd1', 'status': 'partial'}, {'action': 'd2', 'status': 'pending'}], 'clarify': []}),
    ('אולי ערבבתי', {'intent': 'clarify', 'facts': [], 'clarify': ['d3']}),
    ('מה עכשיו?', {'intent': 'next', 'facts': [], 'clarify': []}),
]
DEMONSTRATIONS = '\nדוגמאות לימוד בלבד, אינן חלק מהמתכון הנוכחי: d1=לחתוך תפוח; d2=להוסיף יוגורט; d3=לערבב.\n' + '\n'.join(
    json.dumps({'utterance': text, 'interpretation': value}, ensure_ascii=False, separators=(',', ':')) for text,value in EXAMPLES)


def messages(row, route):
    result = original_messages(row)
    if route == 'fewshot': result[0]['content'] = SYSTEM + DEMONSTRATIONS
    return result


def run(output):
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from transformers.utils.hub import cached_file
    from lmformatenforcer import JsonSchemaParser
    from lmformatenforcer.integrations.transformers import build_token_enforcer_tokenizer_data, build_transformers_prefix_allowed_tokens_fn
    plan = json.loads((ROOT / PLAN).read_text())
    for name, sha in {**plan['source_sha256'], **plan['artifact_sha256']}.items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == sha, name
    data = json.loads((ROOT / plan['data_file']).read_text())
    output = Path(output); output.mkdir(exist_ok=False)
    spec = plan['model']; reports = {}; numeric = {}; vectors = {}
    tokenizer = AutoTokenizer.from_pretrained(spec['repo'], revision=spec['revision'], trust_remote_code=False)
    token_data = build_token_enforcer_tokenizer_data(tokenizer)

    def render(conversation):
        text = tokenizer.apply_chat_template(conversation, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        return tokenizer(text, add_special_tokens=False, return_tensors='pt').to('cuda')

    def generate(conversation, limit, request=None):
        inputs = render(conversation)
        assert inputs['input_ids'].shape[1] + limit <= plan['max_sequence_tokens']
        kwargs = {}
        if request is not None:
            kwargs['prefix_allowed_tokens_fn'] = build_transformers_prefix_allowed_tokens_fn(token_data, JsonSchemaParser(schema(request)))
        torch.cuda.synchronize(); began = time.monotonic()
        with torch.inference_mode():
            generated = model.generate(**inputs, do_sample=False, max_new_tokens=limit,
                temperature=None, top_k=None, top_p=None, pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id, **kwargs)
        torch.cuda.synchronize()
        tokens = generated[0, inputs['input_ids'].shape[1]:].tolist()
        return {'text': tokenizer.decode(tokens, skip_special_tokens=True), 'tokens': tokens,
            'seconds': time.monotonic() - began, 'prompt_tokens': inputs['input_ids'].shape[1], 'hit_limit': len(tokens) == limit}

    for precision, dtype in [('fp16', torch.float16), ('fp32', torch.float32)]:
        gc.collect(); torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats()
        model = AutoModelForCausalLM.from_pretrained(spec['repo'], revision=spec['revision'],
            torch_dtype=dtype, device_map={'': 0}, trust_remote_code=False, attn_implementation='sdpa')
        model.eval(); model.config.use_cache = True
        weight_path = Path(cached_file(spec['repo'], 'model.safetensors', revision=spec['revision']))
        with weight_path.open('rb') as stream: assert hashlib.file_digest(stream, 'sha256').hexdigest() == spec['weight_sha256']
        nonfinite = sum(int((~torch.isfinite(p)).sum().item()) for p in model.parameters())
        weight_max = None if nonfinite else max(float(p.abs().max().item()) for p in model.parameters())
        dtype_counts = {}
        for p in model.parameters(): dtype_counts[str(p.dtype)] = dtype_counts.get(str(p.dtype), 0) + p.numel()
        if precision == 'fp16':
            for route in ['plain', 'free', 'grammar', 'fewshot']:
                records = []
                rows = data['plain'] if route == 'plain' else data['language']
                for i,row in enumerate(rows):
                    conversation = [{'role':'user','content':row['utterance']}] if route == 'plain' else messages(row, route)
                    record = generate(conversation, 24 if route == 'plain' else 96,
                        row['input'] if route in ('grammar','fewshot') else None)
                    records.append({'id':row['id'], **record})
                    dump(output / 'progress.json', {'phase':'generation','route':route,'completed':i+1,'total':len(rows)})
                report = {'route':route, 'records':records, 'metrics':None if route == 'plain' else aggregate(rows,[r['text'] for r in records])[0]}
                dump(output / (route+'.json'),report); reports[route] = report['metrics']
        stats = []
        for row in data['numeric']:
            for prefix_count in [0,24]:
                inputs = render(original_messages(row)); ids = inputs['input_ids']
                if prefix_count:
                    continuation = torch.tensor([row['observed_tokens'][:prefix_count]],dtype=torch.long,device='cuda')
                    ids = torch.cat([ids,continuation],dim=1)
                with torch.inference_mode():
                    result = model(input_ids=ids, attention_mask=torch.ones_like(ids), use_cache=False, logits_to_keep=1)
                logits = result.logits[0,-1].detach().float().cpu(); finite = bool(torch.isfinite(logits).all())
                key = row['id'] + ':' + str(prefix_count)
                top = torch.topk(logits,5)
                stats.append({'id':row['id'],'observed_prefix_tokens':prefix_count,'finite':finite,
                    'max_abs':float(logits.abs().max()) if finite else None,'top5_ids':top.indices.tolist(),
                    'top5_values':top.values.tolist() if finite else None,'logits_float32_sha256':hashlib.sha256(logits.numpy().tobytes()).hexdigest()})
                if precision == 'fp16': vectors[key] = logits
                else:
                    other = vectors[key]
                    stats[-1]['fp16_fp32_cosine'] = float(torch.nn.functional.cosine_similarity(other,logits,dim=0)) if finite and torch.isfinite(other).all() else None
                    stats[-1]['argmax_same'] = int(other.argmax()) == int(logits.argmax())
                del result
        numeric[precision] = {'nonfinite_weight_elements':nonfinite,'max_abs_weight':weight_max,
            'parameter_dtypes':dtype_counts,'probes':stats,'peak_allocated_bytes':torch.cuda.max_memory_allocated(),
            'peak_reserved_bytes':torch.cuda.max_memory_reserved()}
        dump(output / 'numeric.json',numeric)
        if precision == 'fp32' and (numeric['fp16']['nonfinite_weight_elements'] or any(not r['finite'] for r in numeric['fp16']['probes'])):
            records = [{'id':r['id'], **generate([{'role':'user','content':r['utterance']}],24)} for r in data['plain']]
            dump(output/'plain-fp32-conditional.json',{'records':records,'scope':'Triggered only by nonfinite FP16 weights or probed logits.'})
        del model
    dump(output/'result.json',{'metrics':reports,'numeric':numeric,'training_performed':False,
        'product_promotion':False,'scope':plan['scope']})
    dump(output/'progress.json',{'phase':'complete'})


if __name__ == '__main__': run(sys.argv[1])

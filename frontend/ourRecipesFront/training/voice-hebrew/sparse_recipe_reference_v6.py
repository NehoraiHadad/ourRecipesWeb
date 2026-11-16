"""Frozen inference-only reference: tiny free/JSON versus Hebrew-specialist JSON."""
import gc
import hashlib
import json
from pathlib import Path
import statistics
import sys
import time

from sparse_recipe_data_v4 import messages
from sparse_recipe_v3 import INTENTS, STATUSES, aggregate

ROOT = Path(__file__).resolve().parent
PLAN = 'verification/sparse-recipe-plan-v6-20261116.json'


def schema(request):
    ids = [a['id'] for a in request['recipe']['actions']]
    return {'type': 'object', 'additionalProperties': False,
            'required': ['intent', 'facts', 'clarify'], 'properties': {
        'intent': {'type': 'string', 'enum': list(INTENTS)},
        'facts': {'type': 'array', 'maxItems': len(ids), 'items': {
            'type': 'object', 'additionalProperties': False,
            'required': ['action', 'status'], 'properties': {
                'action': {'type': 'string', 'enum': ids},
                'status': {'type': 'string', 'enum': list(STATUSES)}}}},
        'clarify': {'type': 'array', 'maxItems': len(ids) + 1,
                    'items': {'anyOf': [{'type': 'string', 'enum': ids}, {'type': 'null'}]}}}}


def dump(path, value):
    path = Path(path); temp = path.with_suffix('.partial')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n'); temp.replace(path)


def run(output):
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel
    from lmformatenforcer import JsonSchemaParser
    from lmformatenforcer.integrations.transformers import (
        build_token_enforcer_tokenizer_data, build_transformers_prefix_allowed_tokens_fn)
    plan = json.loads((ROOT / PLAN).read_text())
    for name, sha in {**plan['source_sha256'], **plan['artifact_sha256']}.items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == sha, name
    data = json.loads((ROOT / plan['data_file']).read_text())
    rows = data['hard'] + data['regression']
    output = Path(output); output.mkdir(exist_ok=False)
    results = {}; model = tokenizer = token_data = None
    for route in plan['routes']:
        if route != 'tiny-json':
            if model is not None: del model, tokenizer, token_data
            gc.collect(); torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats()
            spec = plan['models']['teacher' if route == 'teacher-json' else 'tiny']
            began = time.monotonic()
            tokenizer = AutoTokenizer.from_pretrained(spec['repo'], revision=spec['revision'], trust_remote_code=False)
            model = AutoModelForCausalLM.from_pretrained(spec['repo'], revision=spec['revision'],
                        torch_dtype=torch.float16, device_map={'': 0}, trust_remote_code=False,
                        attn_implementation='sdpa')
            from transformers.utils.hub import cached_file
            weight_path = Path(cached_file(spec['repo'], 'model.safetensors', revision=spec['revision']))
            with weight_path.open('rb') as stream:
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == spec['weight_sha256']
            if route == 'tiny-free': model = PeftModel.from_pretrained(model, str(ROOT / 'adapter'), is_trainable=False)
            model.eval(); model.config.use_cache = True
            load_seconds = time.monotonic() - began
            began = time.monotonic()
            token_data = build_token_enforcer_tokenizer_data(tokenizer)
            grammar_index_seconds = time.monotonic() - began
        records = []; setup_seconds = 0
        for index, row in enumerate(rows):
            text = tokenizer.apply_chat_template(messages(row), tokenize=False,
                        add_generation_prompt=True, enable_thinking=False)
            inputs = tokenizer(text, add_special_tokens=False, return_tensors='pt').to('cuda')
            assert inputs['input_ids'].shape[1] + plan['max_new_tokens'] <= plan['max_sequence_tokens'], row['id']
            kwargs = {}
            began = time.monotonic()
            if route != 'tiny-free':
                parser = JsonSchemaParser(schema(row['input']))
                kwargs['prefix_allowed_tokens_fn'] = build_transformers_prefix_allowed_tokens_fn(token_data, parser)
            setup = time.monotonic() - began; setup_seconds += setup
            torch.cuda.synchronize(); began = time.monotonic()
            with torch.inference_mode():
                generated = model.generate(**inputs, max_new_tokens=plan['max_new_tokens'], do_sample=False,
                    temperature=None, top_p=None, top_k=None, pad_token_id=tokenizer.eos_token_id,
                    eos_token_id=tokenizer.eos_token_id, **kwargs)
            torch.cuda.synchronize(); seconds = time.monotonic() - began
            tokens = generated[0, inputs['input_ids'].shape[1]:].tolist()
            records.append({'id': row['id'], 'text': tokenizer.decode(tokens, skip_special_tokens=True),
                'tokens': tokens, 'seconds': seconds, 'grammar_setup_seconds': setup,
                'prompt_tokens': inputs['input_ids'].shape[1], 'hit_token_limit': len(tokens) == plan['max_new_tokens']})
            dump(output / (route + '-partial.json'), {'route': route, 'records': records})
            if (index + 1) % 20 == 0:
                dump(output / 'progress.json', {'phase': 'inference', 'route': route, 'completed': index + 1, 'total': len(rows)})
                print(json.dumps({'route': route, 'completed': index + 1}), flush=True)
        metrics = {}
        for group, subset in data.items():
            lookup = {r['id']: r['text'] for r in records}
            metrics[group] = aggregate(subset, [lookup[r['id']] for r in subset])[0]
        report = {'route': route, 'metrics': metrics, 'records': records, 'load_seconds': load_seconds,
            'grammar_token_index_seconds': grammar_index_seconds,
            'grammar_setup_seconds': setup_seconds, 'median_generation_seconds': statistics.median(r['seconds'] for r in records),
            'peak_allocated_bytes': torch.cuda.max_memory_allocated(), 'peak_reserved_bytes': torch.cuda.max_memory_reserved()}
        dump(output / (route + '.json'), report); results[route] = {k:v for k,v in report.items() if k != 'records'}
    dump(output / 'result.json', {'results': results, 'training_performed': False,
        'product_promotion': False, 'scope': plan['scope']})
    dump(output / 'progress.json', {'phase': 'complete'})


if __name__ == '__main__': run(sys.argv[1])

"""Frozen, local-only decision comparison. No training or held-test access."""
import argparse
import hashlib
import http.client
import importlib.util
import json
import math
import os
from pathlib import Path
import resource
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent


def digest(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def import_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_nativ(directory):
    # The released checkpoint already contains the whole encoder. Constructing
    # it from pinned config avoids downloading a second, unused base checkpoint.
    import torch
    from safetensors.torch import load_file
    from transformers import AutoTokenizer
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.manual_seed(42)
    architecture = import_file('stage2_pinned_neobert', directory / 'base-modeling_neobert.py')
    source = import_file('stage2_pinned_nativ', directory / 'decider.py')
    config = architecture.NeoBERTConfig.from_dict(json.loads((directory / 'base-config.json').read_text()))
    encoder = architecture.NeoBERT(config).float()
    model = source.StudentModel(encoder)
    weights = load_file(directory / 'model.safetensors', device='cpu')
    tensor_count = len(weights)
    parameter_count = sum(t.numel() for t in weights.values())
    model.load_state_dict({name: value.float() for name, value in weights.items()}, strict=True)
    del weights
    encoder.freqs_cos, encoder.freqs_sin = architecture.precompute_freqs(
        config.hidden_size // config.num_attention_heads, config.max_length)
    tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True, trust_remote_code=False)
    decider = source.HebrewDecider(model, tokenizer, 'cpu')
    return decider, source, {'strict_tensor_count': tensor_count, 'parameter_count': parameter_count,
        'dtype': 'fp32 CPU inference from released fp16 tensors', 'threads': 4,
        'base_weights_downloaded': False, 'encoder_initialized_from_pinned_config': True,
        'rope_buffers_recomputed': True, 'flash_attention': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--arm', choices=['nativ', 'qwen'], required=True)
    parser.add_argument('--tag', default='v1')
    args = parser.parse_args()
    if not args.tag.replace('-', '').isalnum():
        raise ValueError('Invalid run tag')
    plan = json.loads((ROOT / 'verification/single-recipe-plan-20261116.json').read_text())
    for name, sha in plan['source_sha256'].items():
        if digest(ROOT / name) != sha:
            raise ValueError('Source changed: ' + name)
    for name, sha in plan['artifact_sha256'][args.arm].items():
        if digest(name) != sha:
            raise ValueError('Artifact changed: ' + name)
    if digest(ROOT / plan['data_file']) != plan['data_sha256']:
        raise ValueError('Frozen dataset changed')
    dataset = json.loads((ROOT / plan['data_file']).read_text())
    out = ROOT / 'runs/single-recipe-v2' / f'{args.arm}-{args.tag}'
    out.mkdir(parents=True, exist_ok=False)
    result = {'arm': args.arm, 'plan': plan, 'context_policy': dataset['manifest']['contextPolicy'],
              'training_performed': False, 'held_tests_inferred': False, 'physical_phone_tested': False,
              'browser_inference_performed': False, 'application_state_committed': False, 'rows': []}
    child = log = None

    def event(**values):
        values['utc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        with (out / 'events.jsonl').open('a') as f:
            f.write(json.dumps(values, ensure_ascii=False) + '\n')
        print(json.dumps(values, ensure_ascii=False), flush=True)

    def save():
        (out / 'partial.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')

    try:
        began = time.perf_counter()
        if args.arm == 'nativ':
            os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
            nativ, source, result['loader'] = load_nativ(Path(plan['nativ_directory']))
            result['load_ms'] = (time.perf_counter() - began) * 1000
            controls = plan['nativ_controls']
            batched = nativ.decide_many(controls)
            serial = [nativ.decide_many([c])[0] for c in controls]
            difference = max(abs(a-b) for x,y in zip(batched,serial) for a,b in zip(x,y))
            result['controls'] = {'inputs': controls, 'batched': batched, 'serial': serial,
                                  'max_batch_serial_difference': difference,
                                  'semantic_expected_indices': plan['nativ_control_expected']}
            if difference > 1e-4 or not all(math.isfinite(p) for row in batched for p in row):
                raise ValueError('Numerical loader/batch control failed')
        else:
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]

            def post(endpoint, body):
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=120)
                try:
                    connection.request('POST', endpoint, json.dumps(body, ensure_ascii=False).encode(), {'Content-Type':'application/json'})
                    response = connection.getresponse(); data = json.loads(response.read())
                    if response.status != 200:
                        raise RuntimeError(str(data))
                    return data
                finally:
                    connection.close()

            command = [plan['qwen_binary'], '--model', plan['qwen_model'], '--host','127.0.0.1','--port',str(port),
                       '--threads','4','--threads-batch','4','--ctx-size','1536','--batch-size','128','--ubatch-size','64',
                       '--parallel','1','--n-gpu-layers','0','--jinja','--reasoning','off',
                       '--no-context-shift','--flash-attn','off','--no-webui','--load-mode','none']
            log = (out / 'native-server.log').open('x')
            child = subprocess.Popen(command, stdout=log, stderr=log)
            result['server_command'] = command
            for _ in range(120):
                if child.poll() is not None:
                    raise RuntimeError('Native server exited')
                try:
                    c = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
                    c.request('GET','/health'); healthy=c.getresponse().status==200;c.close()
                    if healthy:break
                except OSError:
                    pass
                time.sleep(0.5)
            else:
                raise TimeoutError('Native server load timeout')
            result['load_ms'] = (time.perf_counter() - began) * 1000
        event(phase='ready', arm=args.arm, load_ms=result['load_ms'])
        for index, item in enumerate(dataset['cases']):
            started = time.perf_counter()
            row = {'id':item['id'], 'family':item['family']}
            if args.arm == 'nativ':
                decisions = item['nativ_decisions']
                lengths = []
                for decision in decisions:
                    encoded = source.encode_example(nativ.tokenizer, decision)
                    full = len(nativ.tokenizer(decision['state'], add_special_tokens=False).input_ids)
                    fixed = 3 + len(nativ.tokenizer(decision['question'], add_special_tokens=False).input_ids)
                    fixed += sum(min(64,len(nativ.tokenizer(o,add_special_tokens=False).input_ids) or 1)+1 for o in decision['options'])
                    truncated = max(0,full-max(0,1024-fixed))
                    if truncated or encoded['prompt_tokens'] > 1024:
                        raise ValueError('State truncation would invalidate case: '+item['id'])
                    lengths.append(encoded['prompt_tokens'])
                probabilities = nativ.decide_many(decisions)
                if not all(math.isfinite(p) and 0<=p<=1 for ps in probabilities for p in ps):
                    raise ValueError('Nonfinite decision probabilities')
                choices = [max(range(len(p)), key=p.__getitem__) for p in probabilities]
                row.update(probabilities=probabilities,choices=choices,input_tokens=lengths,
                           encoded_question_count=len(decisions),forward_passes=1,
                           interpretation={'intent':plan['intent_labels'][choices[0]],
                                           'actions':[plan['status_labels'][i] for i in choices[1:]]})
            else:
                request = item['qwen_request']
                rendered = post('/apply-template',request)
                tokens = post('/tokenize',{'content':rendered['prompt'],'add_special':True,'parse_special':True})['tokens']
                if len(tokens)+request['max_tokens']>1536:
                    raise ValueError('Qwen context budget exceeded')
                response = post('/v1/chat/completions',request)
                text = response['choices'][0]['message'].get('content','')
                try: interpretation = json.loads(text)
                except ValueError: interpretation = None
                row.update(response=response,text=text,input_tokens=len(tokens),interpretation=interpretation)
            row['ms'] = (time.perf_counter()-started)*1000
            result['rows'].append(row);save()
            event(phase='case',arm=args.arm,index=index+1,total=len(dataset['cases']),id=item['id'],ms=round(row['ms'],2))
        result['completed'] = True
    except Exception as error:
        result['completed'] = False;result['error'] = repr(error)
        event(phase='error',arm=args.arm,error=repr(error))
    finally:
        if child:
            child.terminate()
            try:child.wait(timeout=10)
            except subprocess.TimeoutExpired:child.kill();child.wait()
        if log:log.close()
        result['cpu_peak_self_rss_kib'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        result['cpu_peak_children_rss_kib'] = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
        result['memory_scope'] = 'Linux process high-water marks including initialization and copies; not phone/browser/model-only memory and not comparable to old summed Chromium RSS.'
        (out / 'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        event(phase='finished',arm=args.arm,completed=result['completed'],recorded_cases=len(result['rows']))
    if not result['completed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

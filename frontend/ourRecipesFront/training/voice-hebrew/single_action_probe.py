"""One bounded primitive diagnostic, not another full-recipe prompt variant."""
import argparse
import hashlib
import http.client
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import time
from single_recipe_study import load_nativ

ROOT=Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--arm',choices=['nativ','qwen'],required=True);args=parser.parse_args()
    plan=json.loads((ROOT/'verification/single-action-probe-plan-20261116.json').read_text())
    for f,h in plan['source_sha256'].items():
        if sha(ROOT/f)!=h:raise ValueError('Frozen source changed: '+f)
    parent=json.loads((ROOT/'verification/single-recipe-plan-20261116-compatible.json').read_text())
    for f,h in parent['artifact_sha256'][args.arm].items():
        if sha(f)!=h:raise ValueError('Model artifact changed: '+f)
    out=ROOT/'runs/single-action-probe-20261116'/args.arm;out.mkdir(parents=True,exist_ok=False)
    result={'arm':args.arm,'scope':'16 projected development decisions, one action and current utterance only. Not full recipe, conversation, held evaluation or phone/browser test.','plan':plan,'rows':[],'training_performed':False}
    child=log=None
    try:
        started=time.perf_counter()
        if args.arm=='nativ':
            os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1')
            decider,source,loader=load_nativ(Path(parent['nativ_directory']));result['loader']=loader
        else:
            with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
            def post(endpoint,body):
                c=http.client.HTTPConnection('127.0.0.1',port,timeout=60)
                try:
                    c.request('POST',endpoint,json.dumps(body,ensure_ascii=False).encode(),{'Content-Type':'application/json'});r=c.getresponse();value=json.loads(r.read())
                    if r.status!=200:raise RuntimeError(str(value))
                    return value
                finally:c.close()
            command=[parent['qwen_binary'],'--model',parent['qwen_model'],'--host','127.0.0.1','--port',str(port),'--threads','4','--threads-batch','4','--ctx-size','1536','--batch-size','128','--ubatch-size','64','--parallel','1','--n-gpu-layers','0','--jinja','--reasoning','off','--no-context-shift','--flash-attn','off','--no-webui','--load-mode','none']
            log=(out/'server.log').open('x');child=subprocess.Popen(command,stdout=log,stderr=log)
            for _ in range(120):
                if child.poll() is not None:raise RuntimeError('Native server exited')
                try:
                    c=http.client.HTTPConnection('127.0.0.1',port,timeout=1);c.request('GET','/health');ok=c.getresponse().status==200;c.close()
                    if ok:break
                except OSError:pass
                time.sleep(.5)
            else:raise TimeoutError('Load timeout')
        result['load_ms']=(time.perf_counter()-started)*1000
        for probe in plan['probes']:
            began=time.perf_counter();row={'id':probe['id'],'expected':probe['expected']}
            if args.arm=='nativ':
                decision={k:probe[k] for k in ['state','question','options']}
                encoded=source.encode_example(decider.tokenizer,decision)
                if encoded['prompt_tokens']>1024:raise ValueError('Probe too long')
                probabilities=decider.decide_many([decision])[0]
                if not all(math.isfinite(p) for p in probabilities):raise ValueError('Nonfinite output')
                index=max(range(len(probabilities)),key=probabilities.__getitem__)
                row.update(probabilities=probabilities,input_tokens=encoded['prompt_tokens'],predicted=parent['status_labels'][index])
            else:
                choices='\n'.join(f'{chr(65+i)}. {option}' for i,option in enumerate(probe['options']))
                request={'messages':[{'role':'system','content':'קרא את הטקסט והשאלה. בחר אפשרות אחת בלבד מבין האפשרויות. החזר רק את האות של התשובה, ללא הסבר.'},{'role':'user','content':f"טקסט: {probe['state']}\nשאלה: {probe['question']}\nאפשרויות:\n{choices}"}],'chat_template_kwargs':{'enable_thinking':False}}
                rendered=post('/apply-template',request)['prompt'];grammar='root ::= '+ ' | '.join(json.dumps(chr(65+i)) for i in range(len(probe['options'])))
                response=post('/completion',{'prompt':rendered,'grammar':grammar,'n_predict':1,'temperature':0,'seed':42,'cache_prompt':False,'return_tokens':True})
                text=response.get('content','').strip();index=ord(text)-65 if len(text)==1 else -1
                row.update(response=response,text=text,predicted=parent['status_labels'][index] if 0<=index<len(probe['options']) else None)
            row['correct']=row['predicted']==probe['expected'];row['ms']=(time.perf_counter()-began)*1000;result['rows'].append(row)
            (out/'partial.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
            print(json.dumps({'arm':args.arm,'id':row['id'],'correct':row['correct'],'ms':round(row['ms'],2)}),flush=True)
        result['completed']=True;result['correct']=sum(r['correct'] for r in result['rows'])
    except Exception as e:result['completed']=False;result['error']=repr(e)
    finally:
        if child:
            child.terminate()
            try:child.wait(timeout=10)
            except subprocess.TimeoutExpired:child.kill();child.wait()
        if log:log.close()
        (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    if not result['completed']:raise SystemExit(result['error'])


if __name__=='__main__':main()

"""CPU-only small semantic head on a frozen trained encoder; no app integration."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import time
from corpus import ROOT,load_data,digest
from reference_data import LABELS,training
from reference_contract import resolve
from state_metrics import breakdown
from span_pilot import grounded,encode,infer

THRESHOLDS=(.5,.7,.85,.95,.99)


def build_head():
    import torch
    return torch.nn.Sequential(torch.nn.LayerNorm(1536),torch.nn.Linear(1536,128),torch.nn.GELU(),torch.nn.Dropout(.1),torch.nn.Linear(128,4))


def features(model,tok,texts):
    import torch
    output=[];model.eval()
    for off in range(0,len(texts),16):
        batch=texts[off:off+16];x=tok(['משמעות של דיווח התקדמות בבישול']*len(batch),batch,padding=True,truncation=False,return_tensors='pt')
        if x['input_ids'].shape[1]>512:raise ValueError('No silent truncation')
        with torch.inference_mode():h=model.bert(**x).last_hidden_state
        mask=((x['token_type_ids']==1)&x['attention_mask'].bool()&(x['input_ids']!=tok.sep_token_id)).unsqueeze(-1)
        output.append(torch.cat([h[:,0],(h*mask).sum(1)/mask.sum(1).clamp_min(1)],dim=1).float())
    return torch.cat(output)


def actuals(rows,recs,predictions,baseline,threshold):
    output={}
    for row in rows:
        mode,p=predictions[row['utterance']]
        if mode=='other' or p<threshold:output[row['id']]=baseline[row['id']];continue
        state={'recipe_id':row['recipe_id'],**row['state']}
        output[row['id']]=resolve(recs[row['recipe_id']],state,{'mode':mode,'confidence':p,'evidence':row['utterance']},row['utterance'],threshold)
    return output


def metrics(rows,recs,output):
    records=[]
    for row in rows:
        a=output[row['id']];records.append({'example_id':row['id'],'task':'intent','prediction':a['intent'],'confidence':1.})
        lookup={c['actionId']:c for c in a['changes']}
        for action in recs[row['recipe_id']]['actions']:
            c=lookup.get(action['id']);records.append({'example_id':row['id'],'task':'action','action_id':action['id'],
                'prediction':('done' if c['done'] else 'not_done') if c else 'not_mentioned','confidence':1.,'evidence':c.get('evidence') if c else None})
    return grounded(rows,records,.5)


def predicts(head,texts,x):
    import torch
    head.eval()
    with torch.inference_mode():p=head(x).softmax(-1);confidence,idx=p.max(-1)
    return {t:(LABELS[int(i)],float(c)) for t,i,c in zip(texts,idx,confidence)}


def quality(b,stress):
    ok=(b['state']['recall']>=.75 and b['state']['false_updates']==0 and b['groups']['rate']>=.75
        and b['guardrail']['false_updates']<=3 and b['guardrail']['recall']>=.876551724137931 and b['guardrail']['exact']>=294
        and stress['false_updates']==0 and stress['exact_rate']>=.75)
    return ok


def run(output,steps=500):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    torch.set_num_threads(2);started=time.monotonic();output=Path(output);output.mkdir(parents=True,exist_ok=False)
    folder=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run'
    base_data=ROOT/'runs/state-v13-preflight/shared';recs,rows=load_data(base_data)
    valid=[r for r in rows if r['split']=='validation'];held=[r for r in rows if r['split']!='train'];train=training(held)
    with (folder/'model/model.safetensors').open('rb') as f:body_sha=hashlib.file_digest(f,'sha256').hexdigest()
    plan={'study':'reference-language-head','scope':'Frozen encoder; only a small CPU MLP learns semantic reference mode. Deterministic code binds state.',
        'created_utc':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'body_sha256':body_sha,'training_examples':len(train),'training_classes':dict(Counter(r['label'] for r in train)),
        'train_sha256':digest(train),'seeds':[42,17],'steps':steps,'thresholds':THRESHOLDS,'test_inference':False,
        'source_sha256':{n:digest((ROOT/n).read_bytes()) for n in ('reference_contract.py','reference_data.py','reference_train.py')}}
    (output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');(output/'training.json').write_text(json.dumps(train,ensure_ascii=False,indent=2)+'\n')
    model=AutoModelForTokenClassification.from_pretrained(folder/'model',local_files_only=True,attn_implementation='eager').eval()
    for p in model.parameters():p.requires_grad_(False)
    tok=AutoTokenizer.from_pretrained(folder/'model',local_files_only=True)
    fixtures=json.loads((ROOT/'verification/state-v12-invariance-fixtures-20261112.json').read_text());sr={r['id']:r for r in fixtures['recipes']};sx=fixtures['rows']
    baseline={c['id']:c['actual'] for c in json.loads((folder/'validation-research-full.json').read_text())['cases']}
    cfg=json.loads((folder/'run-config.json').read_text());threshold=json.loads((folder/'research-decision.json').read_text())['threshold']
    # Real native baseline stress, fixed legacy decision; no speculative fallback.
    items=[i for row in sx for i in encode(tok,sr[row['recipe_id']],row,cfg['span_profile'])]
    sm=grounded(sx,infer(model,tok,items,'cpu'),threshold);sb={c['id']:c['actual'] for c in sm['cases']}
    texts=list(dict.fromkeys([r['text'] for r in train]+[r['utterance'] for r in valid]+[r['utterance'] for r in sx]))
    print(json.dumps({'phase':'frozen_encoder_features','unique_texts':len(texts),'train_examples':len(train)}),flush=True)
    fx=features(model,tok,texts);lookup={t:i for i,t in enumerate(texts)}
    x=fx[[lookup[r['text']] for r in train]];y=torch.tensor([LABELS.index(r['label']) for r in train]);counts=torch.bincount(y,minlength=4).float();weights=counts.sum()/(4*counts)
    variants=[]
    for seed in (42,17):
        torch.manual_seed(seed);head=build_head();optimizer=torch.optim.AdamW(head.parameters(),lr=.001,weight_decay=.01);best=None
        for step in range(1,steps+1):
            head.train();optimizer.zero_grad(set_to_none=True);loss=torch.nn.functional.cross_entropy(head(x),y,weight=weights);loss.backward();optimizer.step()
            if step%50:continue
            pred=predicts(head,texts,fx)
            for t in THRESHOLDS:
                vm=metrics(valid,recs,actuals(valid,recs,pred,baseline,t));b=breakdown(valid,vm)
                stress=metrics(sx,sr,actuals(sx,sr,pred,sb,t));q=quality(b,stress)
                cost=5*vm['false_updates']+vm['expected_updates']-(vm['proposed_updates']-vm['false_updates'])
                key=(q,-cost,b['groups']['rate'],b['state']['recall'],t)
                if best is None or key>tuple(best['key']):
                    best={'key':key,'step':step,'seed':seed,'threshold':t,'qualified':q,'validation_breakdown':b,'stress':{k:v for k,v in stress.items() if k not in ('cases','by_scenario')},'loss':float(loss.detach())}
                    torch.save(head.state_dict(),output/f'head-{seed}.pt');(output/f'validation-{seed}.json').write_text(json.dumps(vm,ensure_ascii=False,indent=2)+'\n')
                    (output/f'stress-{seed}.json').write_text(json.dumps(stress,ensure_ascii=False,indent=2)+'\n')
            print(json.dumps({'seed':seed,'step':step,'best':{k:best[k] for k in ('step','threshold','qualified')},'state':best['validation_breakdown']['state'],'groups':best['validation_breakdown']['groups']}),flush=True)
        variants.append(best)
    result={'study':'reference-language-head','plan':plan,'variants':variants,'all_qualified':all(v['qualified'] for v in variants),
        'validation_fallback':'Saved actual T4 outputs from the exact frozen baseline; stress fallback is actual native CPU. Deterministic composition is scored, not full live end-to-end voice.',
        'new_test_inference':False,'physical_device_tested':False,'human_reviewed':False,'seconds':time.monotonic()-started}
    torch.save({'texts':texts,'features':fx},output/'features.pt')
    (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print('REFERENCE_HEAD_DONE',json.dumps(result),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=500);a=p.parse_args()
    if a.steps!=500:raise SystemExit('Fixed500-step head-only pilot')
    run(a.output,a.steps)

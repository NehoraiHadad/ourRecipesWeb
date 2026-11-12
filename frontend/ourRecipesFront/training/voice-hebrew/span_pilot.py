"""Evidence-supervised token classifier pilot. No cloud allocation or app mutation."""
import argparse
import json
import os
from pathlib import Path
import random
import time
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY','1')
os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
from ablation import augmented_data
from challenge import challenge, fingerprint
from corpus import ROOT, LABELS, MODEL_ID, MODEL_REVISION, digest, load_data, queries
from engine import allowed, records_from_logits, score, training_order, verify_manifest


def training_loss(logits, targets, items, profile, legacy_weights):
    import torch
    if profile=='context-qa-v4':
        from boundary_head import loss
        return loss(logits,items)
    if profile in ('span-v1','context-span-v3'):
        losses=torch.nn.functional.cross_entropy(logits.transpose(1,2),targets,weight=legacy_weights,ignore_index=-100,reduction='none')
        return losses.sum()/(targets!=-100).sum()
    losses=torch.nn.functional.cross_entropy(logits.transpose(1,2),targets,ignore_index=-100,reduction='none')
    rows=[]
    for j,item in enumerate(items):
        if item['query']['task']=='intent':rows.append(losses[j,0]*item.get('loss_weight',1.));continue
        positions=item['positions']
        if not positions:raise ValueError('No current-report tokens')
        labels=targets[j,positions]
        has_evidence=item['query']['label']!='not_mentioned'
        # Downweight background only in supported spans. An unsupported action
        # is a fully supervised negative, not a low-weight background example.
        weights=torch.where(labels==2,.15,1.) if has_evidence else torch.ones_like(labels,dtype=logits.dtype)
        token_loss=(losses[j,positions]*weights).mean()
        value=.5*losses[j,0]+.5*token_loss
        if item.get('loss_weight',1.)!=1.:value=value*item['loss_weight']
        rows.append(value)
    return torch.stack(rows).mean()


def encode(tokenizer, recipe, row, profile='span-v1'):
    if profile not in ('span-v1','joint-contrast-v2','context-span-v3','context-joint-v3','context-qa-v4','context-state-v4'):raise ValueError('Unknown span profile')
    joint=profile in ('joint-contrast-v2','context-joint-v3','context-qa-v4','context-state-v4')
    result=[]
    if profile=='context-state-v4':
        from state_input_probe import proposed_queries
        qs=proposed_queries(recipe,row)
    else:qs=queries(recipe,row,3 if profile.startswith('context-') else 2)
    for q in qs:
        encoded=tokenizer(q['context'],q['utterance'],return_offsets_mapping=True,truncation=False)
        if len(encoded['input_ids'])>512:raise ValueError('Span input too long; no silent truncation')
        offsets=encoded.pop('offset_mapping');sequence=encoded.sequence_ids()
        labels=[-100]*len(offsets);positions=[]
        current_start=len(q['utterance'])-len(row['utterance'])
        if q['task']=='intent':labels[0]=LABELS.index(row['gold']['intent'])
        else:
            if joint:labels[0]=LABELS.index(q['label'])
            gold=next((c for c in row['gold']['changes'] if c['actionId']==q['action_id']),None)
            span=None
            if gold:
                begin=row['utterance'].find(gold['evidence'])
                if begin<0:raise ValueError('Missing local evidence')
                span=(begin+current_start,begin+current_start+len(gold['evidence']))
            for i,((begin,end),segment) in enumerate(zip(offsets,sequence)):
                if segment==1 and end>begin and begin>=current_start:
                    positions.append(i);labels[i]=2
                    if span and begin<span[1] and end>span[0]:labels[i]=0 if gold['done'] else 1
            if gold and not any(label in (0,1) for label in labels):raise ValueError('Evidence has no supervised tokens')
        result.append({'query':q,'inputs':dict(encoded),'targets':labels,'positions':positions,
            'sampling_context':('פעולה נבדקת: '+next(a['text'] for a in recipe['actions'] if a['id']==q['action_id'])) if profile=='context-state-v4' and q['task']=='action' else q['context'],
            'offsets':offsets,'current_start':current_start,'current_utterance':row['utterance'],
            'joint_gate':joint,'profile':profile})
    return result


def decode(item, logits):
    if item.get('profile')=='context-qa-v4':
        from boundary_head import decode as decode_boundary
        return decode_boundary(item,logits)
    q=item['query']
    if q['task']=='intent':return records_from_logits([q],[logits[0]])[0]
    pair=records_from_logits([q],[logits[0]])[0] if item.get('joint_gate') else None
    if pair and pair['prediction']=='not_mentioned':
        return {**q,'prediction':'not_mentioned','confidence':pair['confidence'],'evidence':None}
    chunks=[];active=None
    for i in item['positions']:
        record=records_from_logits([{**q,'task':'action'}],[logits[i]])[0]
        label=record['prediction'];begin,end=item['offsets'][i]
        if label not in ('done','not_done'):
            active=None;continue
        if active is None or active['label']!=label:
            active={'label':label,'begin':begin,'end':end,'confidence':record['confidence']};chunks.append(active)
        else:active['end']=end;active['confidence']=min(active['confidence'],record['confidence'])
    # Conflicting/non-contiguous evidence is ambiguous. Generic correction words
    # alone cannot justify an update. Do not fuse two clauses into one assertion.
    if len(chunks)==1:
        chunk=chunks[0];text=item['current_utterance'][chunk['begin']-item['current_start']:chunk['end']-item['current_start']]
        words=[w for w in text.split() if any(c.isalpha() for c in w)]
        generic={'תיקון','לא','כן','עוד','אבל','אני','זה','עשיתי','סיימתי','בעצם'}
        if len(words)>=2 and any(w not in generic for w in words):
            if pair and pair['prediction']!=chunk['label']:
                return {**q,'prediction':'not_mentioned','confidence':1.0,'evidence':None}
            return {**q,'prediction':chunk['label'],'confidence':min(chunk['confidence'],pair['confidence']) if pair else chunk['confidence'],'evidence':text}
    return {**q,'prediction':'not_mentioned','confidence':1.0,'evidence':None}


def infer(model, tokenizer, items, device, deadline=None, onnx=None, fixture_output=None, threshold=.5):
    import numpy as np
    import torch
    records=[];fixtures=[]
    if fixture_output and any(i.get('profile')=='context-qa-v4' for i in items):raise ValueError('Boundary profile is native research only; browser export not implemented')
    if model is not None:model.eval()
    elif onnx is None:raise ValueError('A model or ONNX session is required')
    for offset in range(0,len(items),16):
        if deadline and time.monotonic()>deadline:raise TimeoutError('Span inference deadline exceeded')
        batch=items[offset:offset+16]
        inputs=tokenizer.pad([x['inputs'] for x in batch],padding=True,return_tensors='pt')
        if onnx:
            arrays={k:v.numpy().astype(np.int64) for k,v in inputs.items()};logits=onnx.run(None,arrays)[0]
        else:
            with torch.inference_mode():logits=model(**{k:v.to(device) for k,v in inputs.items()}).logits.float().cpu().numpy()
        expected=10 if batch[0].get('profile')=='context-qa-v4' else 8
        if logits.shape[-1]!=expected:raise ValueError('Model output channels do not match decoder profile')
        records.extend(decode(item,values.tolist()) for item,values in zip(batch,logits))
        if fixture_output:
            arrays={k:v.numpy().astype(np.int64) for k,v in inputs.items()}
            with torch.inference_mode():fp32=model(**{k:v.to(device) for k,v in inputs.items()}).logits.float().cpu().numpy()
            width=logits.shape[1];decisions=[]
            for j,item in enumerate(batch):
                for i in ([0] if item['query']['task']=='intent' else ([0] if item.get('joint_gate') else [])+item['positions']):
                    decisions.append({'offset':(j*width+i)*8,'indices':allowed(item['query']['task'])})
            fixtures.append({'inputs':{k:{'dims':list(v.shape),'data':v.flatten().tolist()} for k,v in arrays.items()},
                'expected':logits.tolist(),'fp32_expected':fp32.tolist(),'decisionRows':decisions,'threshold':threshold,
                'spanItems':[{'task':x['query']['task'],'positions':x['positions'],'offsets':x['offsets'],
                    'current_start':x['current_start'],'current_utterance':x['current_utterance'],'joint_gate':x.get('joint_gate',False)} for x in batch]})
    if fixture_output:Path(fixture_output).write_text(json.dumps(fixtures)+'\n')
    return records


def add_browser_metadata(run):
    """Attach decoder inputs after asserting they match every reference tensor."""
    from transformers import AutoTokenizer
    import torch
    run=Path(run);tokenizer=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    profile=json.loads((run/'run-config.json').read_text()).get('span_profile','span-v1')
    if profile in ('context-qa-v4','context-state-v4'):raise ValueError('Research browser export is not implemented')
    recs,rows=load_data(run.parent/'selected-data');cr,crows=challenge()
    for target,rr,xx in [(run/'onnx/browser-fixtures.json',recs,[r for r in rows if r['split']=='validation']),
                         (run/'challenge-browser-fixtures.json',cr,crows)]:
        items=[item for row in xx for item in encode(tokenizer,rr[row['recipe_id']],row,profile)]
        fixtures=json.loads(target.read_text());cursor=0
        for fixture in fixtures:
            count=fixture['inputs']['input_ids']['dims'][0];batch=items[cursor:cursor+count];cursor+=count
            inputs=tokenizer.pad([x['inputs'] for x in batch],padding=True,return_tensors='pt')
            for k,v in inputs.items():
                if fixture['inputs'][k] != {'dims':list(v.shape),'data':v.flatten().tolist()}:
                    raise ValueError('Browser metadata does not match reference tensors')
            fixture['spanItems']=[{'task':x['query']['task'],'positions':x['positions'],'offsets':x['offsets'],
                'current_start':x['current_start'],'current_utterance':x['current_utterance'],'joint_gate':x.get('joint_gate',False)} for x in batch]
        if cursor!=len(items):raise ValueError('Incomplete span fixture coverage')
        target.write_text(json.dumps(fixtures)+'\n')


def grounded(rows, records, threshold):
    metrics=score(rows,records,threshold)
    lookup={(r['example_id'],r['action_id']):r for r in records if r['task']=='action'}
    grounded_exact=0;unsupported_evidence=0
    for row,case in zip(rows,metrics['cases']):
        quotes={c['actionId']:c['evidence'] for c in row['gold']['changes']}
        matched=True
        for c in case['actual']['changes']:
            record=lookup[row['id'],c['actionId']]
            quote=record.get('evidence')
            if quote!=quotes.get(c['actionId']):unsupported_evidence+=1;matched=False
            c['evidence']=quote
        grounded_exact+=int(case['exact'] and matched)
    metrics['exact_including_gold_evidence']=grounded_exact
    metrics['nonmatching_gold_evidence']=unsupported_evidence
    return metrics


def retain_best(model, tokenizer, folder, metrics, step, previous=None, objective='grounded-exact'):
    """Preserve the strongest validation checkpoint, independently of latest weights."""
    if objective not in ('grounded-exact','f0.5','cost5'):raise ValueError('Unknown checkpoint objective')
    p=metrics['update_precision'] or 0;r=metrics['update_recall']
    f=.0 if not p+r else 1.25*p*r/(.25*p+r)
    key=(f,p,metrics['exact_rate'],metrics['exact_including_gold_evidence']) if objective=='f0.5' else (metrics['exact_including_gold_evidence'],p,r)
    if objective=='cost5':
        from research_decision import key as decision_key
        key=decision_key(metrics)
    if previous is not None and key<=tuple(previous['key']):return previous
    folder=Path(folder);model.save_pretrained(folder/'best-validation-model',safe_serialization=True)
    tokenizer.save_pretrained(folder/'best-validation-model')
    result={'step':step,'key':key,'selection':'Validation only; '+objective,
        'threshold':metrics.get('threshold',.5),
        'metrics':{k:v for k,v in metrics.items() if k not in ['cases','by_scenario']}}
    (folder/'best-validation.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


def export_artifact(model, tokenizer, items, output):
    import numpy as np
    import torch
    import onnxruntime as ort
    from onnxruntime.quantization import quantize_dynamic,QuantType
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    class Wrapper(torch.nn.Module):
        def __init__(self,base):super().__init__();self.base=base
        def forward(self,input_ids,attention_mask,token_type_ids):return self.base(input_ids=input_ids,attention_mask=attention_mask,token_type_ids=token_type_ids).logits
    wrapper=Wrapper(model.to('cpu').eval()).eval()
    names=['input_ids','attention_mask','token_type_ids']
    inputs=tokenizer.pad([items[0]['inputs']],padding=True,return_tensors='pt')
    with torch.inference_mode():torch.onnx.export(wrapper,tuple(inputs[k] for k in names),output/'model.onnx',input_names=names,output_names=['logits'],dynamic_axes={**{k:{0:'batch',1:'sequence'} for k in names},'logits':{0:'batch',1:'sequence'}},opset_version=17,dynamo=False)
    options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
    fp_session=ort.InferenceSession(str(output/'model.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    checks=[]
    for batch in [items[:1],items[5:9],items[10:26]]:
        inputs=tokenizer.pad([x['inputs'] for x in batch],padding=True,return_tensors='pt')
        arrays={k:v.numpy().astype(np.int64) for k,v in inputs.items()}
        with torch.inference_mode():expected=wrapper(**inputs).numpy()
        actual=fp_session.run(None,arrays)[0]
        checks.append({'batch':len(batch),'sequence':expected.shape[1],'max_abs_logit_error':float(np.max(np.abs(expected-actual)))})
        if not np.allclose(expected,actual,atol=1e-4,rtol=1e-3):raise ValueError('Span FP32 export mismatch; do not quantize or deploy')
    quantize_dynamic(str(output/'model.onnx'),str(output/'model.int8.onnx'),weight_type=QuantType.QInt8,reduce_range=True,op_types_to_quantize=['MatMul','Gemm','Gather'])
    report={'scope':'Native FP32 parity before quantization; browser/semantic checks separate','input_names':names,'native_parity':checks,
        'onnxruntime_version':ort.__version__,'torch_version':torch.__version__,
        'quantization':{'method':'dynamic','weight_type':'QInt8','reduce_range':True,'operators':['MatMul','Gemm','Gather']},
        'files':{name:{'bytes':(output/name).stat().st_size,'sha256':digest((output/name).read_bytes())} for name in ['model.onnx','model.int8.onnx']}}
    (output/'export-report.json').write_text(json.dumps(report,indent=2)+'\n')
    return ort.InferenceSession(str(output/'model.int8.onnx'),sess_options=options,providers=['CPUExecutionProvider'])


def reexport(run):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    torch.set_num_threads(4);run=Path(run)
    config=json.loads((run/'run-config.json').read_text())
    if config.get('span_profile') in ('context-qa-v4','context-state-v4'):raise ValueError('Research profile requires separate export/browser support')
    if config['model'] not in ('dicta-il/dictabert-tiny','dicta-il/dictabert'):
        raise ValueError('Verify the source artifact license before re-exporting another model')
    model=AutoModelForTokenClassification.from_pretrained(run/'model',local_files_only=True,attn_implementation='eager').eval()
    tokenizer=AutoTokenizer.from_pretrained(run/'model',local_files_only=True)
    recs,rows=load_data(run.parent/'selected-data');selected=[r for r in rows if r['split']=='validation']
    profile=config.get('span_profile','span-v1')
    items=[x for row in selected for x in encode(tokenizer,recs[row['recipe_id']],row,profile)]
    threshold=json.loads((run/'decision.json').read_text())['threshold']
    session=export_artifact(model,tokenizer,items,run/'onnx')
    (run/'onnx/ATTRIBUTION.txt').write_text('DictaBERT by Dicta, CC-BY-4.0: https://huggingface.co/'+config['model']+'/tree/'+config['revision']+'\nLicense: https://creativecommons.org/licenses/by/4.0/\nChanges: supervised cooking evidence token classifier, ONNX and INT8. Experimental.\n')
    records=infer(model,tokenizer,items,'cpu',onnx=session,fixture_output=run/'onnx/browser-fixtures.json',threshold=threshold)
    metrics=grounded(selected,records,threshold)
    cr,crows=challenge();ci=[x for row in crows for x in encode(tokenizer,cr[row['recipe_id']],row,profile)]
    challenges=infer(model,tokenizer,ci,'cpu',onnx=session,fixture_output=run/'challenge-browser-fixtures.json',threshold=threshold)
    result={'reason':'Export stored weights with explicit ONNX input names and native parity checks; training weights and validation-selected threshold unchanged',
        'repair_source_sha256':digest((ROOT/'span_pilot.py').read_bytes()),'validation':metrics,
        'challenge_selected':grounded(crows,challenges,threshold),'challenge_0_5':grounded(crows,challenges,.5),
        'challenge_role':'Regression, not untouched acceptance','production_ready':False}
    (run/'export-repair.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:{kk:vv for kk,vv in result[k].items() if kk not in ['cases','by_scenario']} for k in ['validation','challenge_selected','challenge_0_5']},indent=2))
    return result


def run(output, steps=1000, max_seconds=600, device='cuda', model_choice='tiny', train_only=False, profile='span-v1', eval_every=1000, data_source=None, seed=42, checkpoint_objective='grounded-exact', regime='balanced-task', contrast_weight=0., checkpoint_io='periodic', shared_head_init=False, warm_start=None, encoder_lr=3e-5, head_lr=3e-4):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    if device=='cuda' and not torch.cuda.is_available():raise RuntimeError('Explicit GPU required for the bounded span pilot')
    if device=='cpu' and steps>2:raise ValueError('CPU mode is limited to a two-step mechanics smoke')
    if regime not in ('balanced-task','paired-family','state-balanced') or checkpoint_io not in ('periodic','best-only'):raise ValueError('Unknown training regime/checkpoint IO')
    if not 0<=contrast_weight<=1 or (contrast_weight and regime not in ('paired-family','state-balanced')):raise ValueError('Contrastive loss requires paired sampling')
    if regime in ('paired-family','state-balanced') and profile not in ('context-joint-v3','context-qa-v4','context-state-v4'):raise ValueError('Paired regime requires joint context')
    if regime=='state-balanced' and profile!='context-state-v4':raise ValueError('State sampler requires the fixed eight-channel state-input profile')
    if profile in ('context-qa-v4','context-state-v4') and not train_only:raise ValueError('Research profile is native training only')
    if warm_start and shared_head_init:raise ValueError('Warm-start weights cannot be randomly reinitialized')
    if not 0<encoder_lr<=3e-5 or not 0<head_lr<=3e-4:raise ValueError('Invalid bounded adaptation rates')
    models={'tiny':(MODEL_ID,MODEL_REVISION),'base':('dicta-il/dictabert','8884c6db002aba4002ee638fe4070c92e9ffbbf1')}
    model_id,model_revision=models[model_choice]
    started=time.monotonic();deadline=started+max_seconds;torch.set_num_threads(4)
    random.seed(seed);torch.manual_seed(seed)
    if device=='cuda':torch.cuda.manual_seed_all(seed)
    output=Path(output)
    if data_source is not None:
        import shutil
        verify_manifest(data_source);data=output/'selected-data';shutil.copytree(data_source,data)
    elif profile=='joint-contrast-v2':
        from targeted_data import build
        data=build(output/'selected-data')
    else:data=augmented_data(output/'selected-data')
    folder=output/'run';folder.mkdir(parents=True,exist_ok=False)
    output_labels=LABELS+['evidence_start','evidence_end'] if profile=='context-qa-v4' else LABELS
    warm_sha=None
    if warm_start:
        import hashlib
        warm_start=Path(warm_start)
        with (warm_start/'model.safetensors').open('rb') as handle:warm_sha=hashlib.file_digest(handle,'sha256').hexdigest()
        tokenizer=AutoTokenizer.from_pretrained(warm_start,local_files_only=True,trust_remote_code=False)
        model=AutoModelForTokenClassification.from_pretrained(warm_start,local_files_only=True,attn_implementation='eager',trust_remote_code=False)
        if [model.config.id2label[i] for i in range(model.config.num_labels)]!=output_labels:raise ValueError('Warm model head contract mismatch')
        torch.manual_seed(seed)
        if device=='cuda':torch.cuda.manual_seed_all(seed)
    else:
        tokenizer=AutoTokenizer.from_pretrained(model_id,revision=model_revision,trust_remote_code=False)
        model=AutoModelForTokenClassification.from_pretrained(model_id,revision=model_revision,num_labels=len(output_labels),id2label=dict(enumerate(output_labels)),label2id={v:i for i,v in enumerate(output_labels)},attn_implementation='eager',trust_remote_code=False)
    if shared_head_init:
        torch.manual_seed(seed+100)
        with torch.no_grad():
            model.classifier.weight[:8].normal_(mean=0,std=model.config.initializer_range);model.classifier.bias.zero_()
            if len(output_labels)>8:
                torch.manual_seed(seed+101);model.classifier.weight[8:].normal_(mean=0,std=model.config.initializer_range)
        torch.manual_seed(seed+102)
        if device=='cuda':torch.cuda.manual_seed_all(seed+102)
    initial_head_sha=digest(model.classifier.weight[:8].detach().cpu().numpy().tobytes()+model.classifier.bias[:8].detach().cpu().numpy().tobytes()) if shared_head_init else None
    model=model.to(device)
    recs,rows=load_data(data)
    sets={split:[item for row in rows if row['split']==split for item in encode(tokenizer,recs[row['recipe_id']],row,profile)] for split in ['train','validation']}
    items=sets['train'];rng=random.Random(seed);order=training_order([x['query'] for x in items],rng,'balanced-task');cursor=0
    paired=None
    if regime in ('paired-family','state-balanced'):
        from paired_sampling import PairedSampler
        if regime=='state-balanced':
            from state_sampling import StateSampler
            sampler_class=StateSampler
        else:sampler_class=PairedSampler
        rng=random.Random(seed);paired=sampler_class(items,[r for r in rows if r['split']=='train'],rng)
    head=[p for n,p in model.named_parameters() if n.startswith('classifier.')]
    body=[p for n,p in model.named_parameters() if not n.startswith('classifier.')]
    optimizer=torch.optim.AdamW([{'params':body,'lr':encoder_lr},{'params':head,'lr':head_lr}],weight_decay=.01)
    weights=torch.tensor([1.,1.,.15,1.,1.,1.,1.,1.],device=device)
    config={'model':model_id,'revision':model_revision,'architecture':'BertForTokenClassification','input_contract':('3' if profile.startswith('context-') else '2')+'+current-evidence-spans','seed':seed,'steps_requested':steps,'batch_size':8,'encoder_lr':encoder_lr,'head_lr':head_lr,'sampling':'balanced-task','outside_token_weight':.15,'corpus_sha256':verify_manifest(data)['corpus_sha256'],'source_sha256':digest((ROOT/'span_pilot.py').read_bytes()),'human_reviewed':False,'production_ready':False}
    config.update(span_profile=profile,eval_every=eval_every,loss='historical weighted token mean' if profile in ('span-v1','context-span-v3') else 'query-balanced token loss + candidate CLS decision; full weight for absent-action tokens')
    if profile=='context-qa-v4':config['loss']='.5 candidate CLS + .25 start + .25 end; current-report/CLS null domain, paired row weights; intent CLS CE'
    config.update(warm_start_sha256=warm_sha,optimizer_restored=False)
    if profile=='context-state-v4':config['input_contract']='4-state-action+current-evidence-spans'
    config['checkpoint_objective']=checkpoint_objective
    config.update(sampling=regime,contrast_weight=contrast_weight,contrast_margin=1.,checkpoint_io=checkpoint_io)
    config.update(shared_head_init=shared_head_init,initial_shared_head_sha256=initial_head_sha,output_channels=len(output_labels))
    if regime=='state-balanced':config['intent_loss_weights']={'report':4/7,'clarify':4/7,'next':2.,'missed':2.,'advice':2.}
    if paired:config['action_loss_weights']={'done':8/7,'not_done':8/7,'not_mentioned':.8}
    (folder/'run-config.json').write_text(json.dumps(config,indent=2)+'\n')
    learning_curve=[];best_checkpoint=None
    if device=='cuda':torch.cuda.reset_peak_memory_stats()
    if warm_start:
        valid=[r for r in rows if r['split']=='validation']
        initial_records=infer(model,tokenizer,sets['validation'],device,deadline)
        if checkpoint_objective=='cost5':
            from research_decision import calibrate as cost_calibrate
            initial=cost_calibrate(valid,initial_records)
        else:initial=grounded(valid,initial_records,.5)
        best_checkpoint=retain_best(model,tokenizer,folder,initial,0,None,checkpoint_objective)
        (folder/'initial-validation.json').write_text(json.dumps(initial,ensure_ascii=False,indent=2)+'\n')
    for step in range(1,steps+1):
        if time.monotonic()>deadline-40:raise TimeoutError('Span training stopped before validation/export reserve')
        if paired:chosen=paired.batch()
        else:
            if cursor>=len(order):order=training_order([x['query'] for x in items],rng,'balanced-task');cursor=0
            chosen=[items[i] for i in order[cursor:cursor+8]];cursor+=len(chosen)
        inputs=tokenizer.pad([x['inputs'] for x in chosen],padding=True,return_tensors='pt')
        length=inputs['input_ids'].shape[1]
        targets=torch.tensor([x['targets']+[-100]*(length-len(x['targets'])) for x in chosen],device=device)
        mask=torch.zeros((len(chosen),length,len(output_labels)),device=device) if profile=='context-qa-v4' else torch.full((len(chosen),length,8),-1e9,device=device)
        if profile!='context-qa-v4':
            for j,item in enumerate(chosen):mask[j,:,allowed(item['query']['task'])]=0
        model.train();optimizer.zero_grad(set_to_none=True)
        logits=model(**{k:v.to(device) for k,v in inputs.items()}).logits+mask
        loss=training_loss(logits,targets,chosen,profile,weights)
        if contrast_weight:
            from paired_sampling import margin_loss
            loss=loss+contrast_weight*margin_loss(logits,chosen)
        if not torch.isfinite(loss):raise RuntimeError('Non-finite span loss')
        loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);optimizer.step()
        if step%50==0:print(json.dumps({'step':step,'loss':float(loss.detach()),'seconds':time.monotonic()-started}),flush=True)
        if step%250==0 and checkpoint_io=='periodic':
            model.save_pretrained(folder/'model',safe_serialization=True);tokenizer.save_pretrained(folder/'model')
        if (step%eval_every==0 or step==2500) and step<steps:
            valid=[r for r in rows if r['split']=='validation']
            validation_records=infer(model,tokenizer,sets['validation'],device,deadline)
            measured=grounded(valid,validation_records,.5)
            raw_validation=measured
            if checkpoint_objective=='cost5':
                from research_decision import calibrate as cost_calibrate
                measured=cost_calibrate(valid,validation_records)
            best_checkpoint=retain_best(model,tokenizer,folder,measured,step,best_checkpoint,checkpoint_objective)
            learning_curve.append({'step':step,'seconds':time.monotonic()-started,
                'validation_at_0_5':{k:v for k,v in raw_validation.items() if k not in ['cases','by_scenario']},
                'checkpoint_selection_metrics':{k:v for k,v in measured.items() if k not in ['cases','by_scenario']}})
            (folder/'learning-curve.json').write_text(json.dumps(learning_curve,indent=2)+'\n')
    training_seconds=time.monotonic()-started
    if checkpoint_io=='periodic':
        model.save_pretrained(folder/'model',safe_serialization=True);tokenizer.save_pretrained(folder/'model')
    selected=[r for r in rows if r['split']=='validation']
    records=infer(model,tokenizer,sets['validation'],device,deadline)
    final_raw=grounded(selected,records,.5)
    (folder/'final-step-validation.json').write_text(json.dumps(final_raw,ensure_ascii=False,indent=2)+'\n')
    final_selection=final_raw
    if checkpoint_objective=='cost5':
        from research_decision import calibrate as cost_calibrate
        final_selection=cost_calibrate(selected,records)
    best_checkpoint=retain_best(model,tokenizer,folder,final_selection,steps,best_checkpoint,checkpoint_objective)
    if best_checkpoint['step']!=steps:
        from safetensors.torch import load_file
        model.load_state_dict(load_file(str(folder/'best-validation-model/model.safetensors'),device='cpu'))
        if checkpoint_io=='periodic':model.save_pretrained(folder/'model',safe_serialization=True)
        records=infer(model,tokenizer,sets['validation'],device,deadline)
    if checkpoint_io=='best-only':
        model.save_pretrained(folder/'model',safe_serialization=True);tokenizer.save_pretrained(folder/'model')
    config['selected_step']=best_checkpoint['step']
    (folder/'run-config.json').write_text(json.dumps(config,indent=2)+'\n')
    candidates=[grounded(selected,records,t) for t in [.5,.6,.7,.8,.85,.9,.95,.99,1.0]]
    safe=[m for m in candidates if m['false_updates']==0 and m['nonmatching_gold_evidence']==0]
    best=max(safe,key=lambda m:(m['exact_including_gold_evidence'],m['update_recall'],-m['threshold']))
    search={'selection':'Validation only: no observed false updates or gold-evidence mismatches, then grounded exact/recall. Not a guarantee.',
        'candidates':[{k:v for k,v in m.items() if k not in ['cases','by_scenario']} for m in candidates]}
    metrics=grounded(selected,records,best['threshold']);raw=grounded(selected,records,.5)
    research=None
    if checkpoint_objective=='cost5':
        research=cost_calibrate(selected,records)
        (folder/'research-decision.json').write_text(json.dumps({'threshold':research['threshold'],'objective':'5*false_updates + missed_updates','minimum_recall':.75,'selected_on':'validation','production_ready':False},indent=2)+'\n')
    (folder/'validation.json').write_text(json.dumps({'metrics':metrics,'at_0_5':raw,'threshold_selection':search},ensure_ascii=False,indent=2)+'\n')
    (folder/'decision.json').write_text(json.dumps({'threshold':best['threshold'],'selected_on':'validation','corpus_sha256':config['corpus_sha256'],'production_ready':False},indent=2)+'\n')
    if train_only:
        report={'scope':'GPU training/native validation only. Export and CPU/browser evaluation must run after GPU release.',
            'steps':steps,'selected_step':best_checkpoint['step'],'training_seconds':training_seconds,
            'gpu_peak_allocated_bytes':torch.cuda.max_memory_allocated() if device=='cuda' else None,
            'validation':{k:v for k,v in metrics.items() if k not in ['cases','by_scenario']},
            'validation_0_5':{k:v for k,v in raw.items() if k not in ['cases','by_scenario']},'production_ready':False}
        report['final_step_validation_0_5']={k:v for k,v in final_raw.items() if k not in ['cases','by_scenario']}
        if research is not None:report['validation_research']={k:v for k,v in research.items() if k not in ['cases','by_scenario']}
        (folder/'training-report.json').write_text(json.dumps(report,indent=2)+'\n');return report
    onnx_dir=folder/'onnx'
    session=export_artifact(model,tokenizer,sets['validation'],onnx_dir)
    int8_records=infer(model,tokenizer,sets['validation'],'cpu',deadline,onnx=session,fixture_output=onnx_dir/'browser-fixtures.json',threshold=best['threshold'])
    int8_metrics=grounded(selected,int8_records,best['threshold'])
    (folder/'evaluation-validation-int8.json').write_text(json.dumps(int8_metrics,ensure_ascii=False,indent=2)+'\n')
    # Evaluate the already frozen challenge after validation selection. It was
    # used to diagnose the earlier classifier, so this is a regression set now,
    # not a fresh independent acceptance test for this new architecture.
    cr,crows=challenge();ci=[item for row in crows for item in encode(tokenizer,cr[row['recipe_id']],row,profile)]
    challenge_records=infer(model,tokenizer,ci,'cpu',deadline,onnx=session,fixture_output=folder/'challenge-browser-fixtures.json',threshold=best['threshold'])
    challenge_metrics={'provenance':fingerprint(),'role':'Regression after earlier classifier diagnosis, not untouched acceptance',
        'selected':grounded(crows,challenge_records,best['threshold']),'at_0_5':grounded(crows,challenge_records,.5)}
    (folder/'challenge.json').write_text(json.dumps(challenge_metrics,ensure_ascii=False,indent=2)+'\n')
    report={'scope':'Real evidence-supervised training, synthetic data; no production or physical-device claim' if device=='cuda' else 'Two-step CPU mechanics smoke only, no accuracy claim','training_seconds':training_seconds,'total_seconds':time.monotonic()-started,'steps':steps,'last_loss':float(loss.detach()),'gpu_peak_allocated_bytes':torch.cuda.max_memory_allocated() if device=='cuda' else None,'gpu':torch.cuda.get_device_name() if device=='cuda' else None,'versions':{'python':__import__('platform').python_version(),'torch':torch.__version__},'validation':{k:v for k,v in metrics.items() if k not in ['cases','by_scenario']},'validation_0_5':{k:v for k,v in raw.items() if k not in ['cases','by_scenario']},'challenge_selected':{k:v for k,v in challenge_metrics['selected'].items() if k not in ['cases','by_scenario']},'test_evaluated':False,'production_ready':False,'artifacts':{name:{'bytes':(onnx_dir/name).stat().st_size,'sha256':digest((onnx_dir/name).read_bytes())} for name in ['model.onnx','model.int8.onnx']}}
    (onnx_dir/'ATTRIBUTION.txt').write_text('DictaBERT by Dicta, CC-BY-4.0: https://huggingface.co/'+model_id+'/tree/'+model_revision+'\nChanges: supervised Hebrew cooking evidence token classifier, ONNX and INT8. Experimental.\n')
    (folder/'training-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,indent=2),flush=True)
    return report


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=1000);p.add_argument('--max-seconds',type=int,default=600);p.add_argument('--cpu-smoke',action='store_true');p.add_argument('--reexport',action='store_true');p.add_argument('--add-browser-metadata',action='store_true');p.add_argument('--model',choices=['tiny','base'],default='tiny');p.add_argument('--train-only',action='store_true');p.add_argument('--profile',choices=['span-v1','joint-contrast-v2','context-span-v3','context-joint-v3'],default='span-v1');p.add_argument('--eval-every',type=int,default=1000);p.add_argument('--data');p.add_argument('--seed',type=int,default=42)
    a=p.parse_args()
    if not 1<=a.steps<=5000 or not 60<=a.max_seconds<=900 or not 1<=a.eval_every<=2500:raise SystemExit('Invalid span pilot budget')
    if a.add_browser_metadata:add_browser_metadata(a.output)
    elif a.reexport:reexport(a.output)
    else:run(a.output,a.steps,a.max_seconds,'cpu' if a.cpu_smoke else 'cuda',a.model,a.train_only,a.profile,a.eval_every,a.data,a.seed)

"""V6 paired duration/LoRA study; all curves are CURRENT, not running-best only."""
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import gc, hashlib, json, random, time
from pathlib import Path
from corpus import ROOT,digest,load_data
from certainty_data import LABELS
from certainty_train import DATA,compact,gates,proposals
from certainty_adapter import install,disabled,export,restore,representation,modules
from certainty_position import build_head
from reference_train import metrics

BODY_SHA='f053074f0118ebdd8157906ef862001135c6b9d6b3e15810e5aca25f6dc30bb4'
CHECKS=(0,100,250,500,750,1000,1250,1500,1750,2000,2500,3000)
MIN_STEPS=2000
MAX_STEPS=3000


class Sampler:
    def __init__(self,rows,seed):
        self.rng=random.Random(seed);self.buckets=defaultdict(list);self.pending=[]
        for i,r in enumerate(rows):self.buckets[r['label']].append(i)
        if set(self.buckets)!=set(LABELS):raise ValueError('Missing semantic class')
    def batch(self,n=8):
        output=[]
        for _ in range(n):
            if not self.pending:self.pending=list(LABELS);self.rng.shuffle(self.pending)
            output.append(self.rng.choice(self.buckets[self.pending.pop()]))
        return output
    def state(self):return {'rng':self.rng.getstate(),'pending':self.pending.copy()}
    def load(self,state):self.rng.setstate(state['rng']);self.pending=list(state['pending'])


def should_stop(step,stale):return step>=MIN_STEPS and stale>=4


def inputs(tok,texts,device):
    x=tok(['משמעות של דיווח התקדמות בבישול']*len(texts),texts,padding=True,truncation=False,return_tensors='pt')
    if x['input_ids'].shape[1]>512:raise ValueError('No truncation')
    return {k:v.to(device) for k,v in x.items()}


def features(model,tok,texts,device):
    import torch
    output=[]
    with torch.no_grad():
        for off in range(0,len(texts),16):output.append(representation(model,inputs(tok,texts[off:off+16],device),tok.sep_token_id))
    return torch.cat(output)


def predictions(head,texts,x):
    import torch
    head.eval()
    with torch.no_grad():p,i=head(x).softmax(-1).max(-1)
    return {t:(LABELS[j],c) for t,j,c in zip(texts,i.cpu().tolist(),p.cpu().tolist())}


def semantics(head,x,rows):
    import torch
    head.eval();y=torch.tensor([LABELS.index(r['label']) for r in rows],device=x.device)
    with torch.no_grad():
        logits=head(x);loss=torch.nn.functional.cross_entropy(logits,y,reduction='none');correct=logits.argmax(-1)==y
    return {'nll':float(loss.mean()),'macro_nll':sum(float(loss[y==k].mean()) for k in y.unique())/len(y.unique()),
        'accuracy':float(correct.float().mean()),'examples':len(rows)}


def snapshot(path,head,model,opt,sampler,step,identity):
    import torch
    torch.save({'head':head.state_dict(),'adapters':export(model),'optimizer':opt.state_dict(),
        'sampler':sampler.state(),'torch_rng':torch.get_rng_state(),'cuda_rng':torch.cuda.get_rng_state_all() if torch.cuda.is_available() else [],
        'step':step,'identity':identity},path)


def reload(path,head,model,opt,sampler,identity):
    import torch
    state=torch.load(path,weights_only=True,map_location='cpu')
    if state['identity']!=identity:raise ValueError('Checkpoint identity mismatch')
    head.load_state_dict(state['head']);restore(model,state['adapters']);opt.load_state_dict(state['optimizer']);sampler.load(state['sampler'])
    torch.set_rng_state(state['torch_rng'])
    if state['cuda_rng']:torch.cuda.set_rng_state_all(state['cuda_rng'])
    return state['step']


def dataset():
    data=json.loads((DATA/'language.json').read_text());vf=json.loads((DATA/'validation.json').read_text())
    recs,old=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old if r['split']=='validation' and r.get('evaluation_kind')!='state']
    sf=json.loads((ROOT/'verification/state-v12-invariance-fixtures-20261112.json').read_text())
    cached=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())
    legacy=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run'
    gb={c['id']:c['actual'] for c in json.loads((legacy/'validation-research-full.json').read_text())['cases']}
    return data,vf,recs,guard,sf,cached,gb


def run_trial(output,base,initial_head,arm,seed,deadline,mechanics=False):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    started=time.monotonic();output=Path(output);output.mkdir(parents=True,exist_ok=False);device='cuda' if torch.cuda.is_available() else 'cpu'
    torch.set_num_threads(2);torch.manual_seed(seed)
    model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').to(device).eval()
    tok=AutoTokenizer.from_pretrained(base,local_files_only=True);info=install(model,rank=8,last_layers=2);model.eval()
    for m in modules(model).values():m.enabled=arm=='adapter'
    head=build_head().to(device);head.load_state_dict(torch.load(initial_head,weights_only=True,map_location=device))
    opt=torch.optim.AdamW([{'params':head.parameters(),'lr':3e-4}]+([{'params':[p for p in model.parameters() if p.requires_grad],'lr':5e-5}] if arm=='adapter' else []),weight_decay=.01)
    data,vf,old_recs,guard,sf,cached,gb=dataset();train=data['train'];rows=vf['rows'];rr={r['id']:r for r in vf['recipes']};stress=sf['rows'];sr={r['id']:r for r in sf['recipes']}
    if mechanics:
        chosen=[]
        for label in LABELS:chosen.extend([r for r in train if r['label']==label][:2])
        train=chosen;data=deepcopy(data);data['train']=train;data['validation']=data['validation'][:2]
        rows=rows[:8];guard=guard[:4];stress=stress[:4]
    sampler=Sampler(train,seed);torch.manual_seed(seed)
    identity={'arm':arm,'seed':seed,'body_sha256':BODY_SHA,'initial_head_sha256':digest(Path(initial_head).read_bytes()),'study':'adapter-v6'}
    # Actual legacy logits before/after training on a known, gold-free turn.
    from span_pilot import encode
    row=deepcopy(guard[0]);row['gold']={'intent':'clarify','changes':[]}
    items=encode(tok,old_recs[row['recipe_id']],row,'context-joint-v3');legacy_x={k:v.to(device) for k,v in tok.pad([i['inputs'] for i in items],padding=True,return_tensors='pt').items()}
    with torch.no_grad(),disabled(model):legacy_before=model(**legacy_x).logits.clone()
    if device=='cuda':torch.cuda.reset_peak_memory_stats()
    texts=list(dict.fromkeys([r['text'] for r in train]+[r['utterance'] for r in rows+guard+stress]));lookup={t:i for i,t in enumerate(texts)}
    tx=[lookup[r['text']] for r in train];vx=[lookup[r['text']] for r in data['validation']]
    frozen=features(model,tok,texts,device) if arm=='control' else None
    best=None;stale=0;running=[];history=[];last_step=0;stop_reason='max_steps';schedule=(0,2) if mechanics else CHECKS
    for step in range((2 if mechanics else MAX_STEPS)+1):
        if time.monotonic()>deadline:stop_reason='resource_deadline';break
        if step:
            idx=sampler.batch();head.train();opt.zero_grad(set_to_none=True)
            x=frozen[[tx[i] for i in idx]] if frozen is not None else representation(model,inputs(tok,[train[i]['text'] for i in idx],device),tok.sep_token_id)
            y=torch.tensor([LABELS.index(train[i]['label']) for i in idx],device=device)
            loss=torch.nn.functional.cross_entropy(head(x),y);loss.backward()
            if step==1 and any(p.grad is not None for p in model.parameters() if not p.requires_grad):raise ValueError('Frozen base received gradient')
            torch.nn.utils.clip_grad_norm_([p for group in opt.param_groups for p in group['params']],1.)
            opt.step();running.append(float(loss.detach()));last_step=step
        if step not in schedule:continue
        allx=frozen if frozen is not None else features(model,tok,texts,device);pred=predictions(head,texts,allx);grid=[]
        for threshold in (.5,.7,.85,.95,.99):
            nm=metrics(rows,rr,proposals(rows,rr,pred,cached['validation'],threshold));gm=metrics(guard,old_recs,proposals(guard,old_recs,pred,gb,threshold));sm=metrics(stress,sr,proposals(stress,sr,pred,cached['stress'],threshold))
            gate=gates(nm,gm,sm,{r['id'] for r in rows if r['evaluation_kind']=='uncertain'})
            cost=sum(5*m['false_updates']+m['expected_updates']-(m['proposed_updates']-m['false_updates']) for m in (nm,gm))
            key=(gate['passed'],-cost,nm['update_recall'],nm['exact_proposals'],threshold)
            grid.append({'threshold':threshold,'key':key,'gate':gate,'new':compact(nm),'guard':compact(gm),'stress':compact(sm)})
        current=max(grid,key=lambda v:v['key']);improved=best is None or tuple(current['key'])>tuple(best['key'])
        if improved:
            best={**current,'step':step,'arm':arm,'seed':seed};stale=0
            torch.save({'head':head.state_dict(),'adapters':export(model),'identity':identity},output/'best.pt')
            threshold=best['threshold']
            (output/'best-validation.json').write_text(json.dumps({'new':metrics(rows,rr,proposals(rows,rr,pred,cached['validation'],threshold)),
                'guard':metrics(guard,old_recs,proposals(guard,old_recs,pred,gb,threshold)),
                'stress':metrics(stress,sr,proposals(stress,sr,pred,cached['stress'],threshold))},ensure_ascii=False)+'\n')
        else:stale+=1
        point={'step':step,'arm':arm,'seed':seed,'elapsed_seconds':time.monotonic()-started,'examples_seen':step*8,
            'equivalent_uniform_passes':step*8/len(train),'unit_note':'Balanced sampling, not literal uniform epochs; warm head already trained previously',
            'batch_loss_since_check':sum(running)/len(running) if running else None,'train':semantics(head,allx[tx],train),
            'validation_language':semantics(head,allx[vx],data['validation']), 'current':current,'fixed_0_85':next(v for v in grid if v['threshold']==.85),
            'threshold_grid':grid,'best_step_so_far':best['step'],'stale_evaluations':stale}
        history.append(point);running=[]
        with (output/'curve.jsonl').open('a') as f:f.write(json.dumps(point)+'\n')
        snapshot(output/'last.pt',head,model,opt,sampler,step,identity)
        progress={'phase':'train','arm':arm,'seed':seed,'step':step,'best_step':best['step'],'qualified':best['gate']['passed'],
            'current_recall':current['new']['update_recall'],'current_false':current['new']['false_updates'],'current_train_nll':point['train']['nll'],'current_validation_nll':point['validation_language']['nll']}
        (output.parent/'progress.json').write_text(json.dumps(progress)+'\n');print(json.dumps(progress),flush=True)
        if not mechanics and should_stop(step,stale):stop_reason='validation_plateau_after_min2000';break
    with torch.no_grad(),disabled(model):legacy_after=model(**legacy_x).logits
    if not torch.equal(legacy_before,legacy_after):raise ValueError('Disabled legacy logits changed')
    result={'arm':arm,'seed':seed,'best':best,'actual_steps':last_step,'stop_reason':stop_reason,'seconds':time.monotonic()-started,
        'legacy_disabled_logits_bitwise_equal':True,'legacy_known_queries':len(items),'adapter_info':info,
        'peak_cuda_allocated_bytes':torch.cuda.max_memory_allocated() if device=='cuda' else None,
        'head_parameters':sum(p.numel() for p in head.parameters()),'device':device,'history_points':len(history),
        'mechanics_only':mechanics,'new_test_inference':False}
    (output/'result.json').write_text(json.dumps(result,indent=2)+'\n');print('TRIAL_DONE',json.dumps(result),flush=True)
    del model,head,opt,frozen
    gc.collect()
    if device=='cuda':torch.cuda.empty_cache()
    return result


def run(output,base,initial_head,max_seconds=2400,mechanics=False):
    import torch
    output=Path(output);output.mkdir(parents=True,exist_ok=False);started=time.monotonic()
    plan=json.loads((ROOT/'verification/adapter-v6-plan-20261112.json').read_text())
    for name,sha in plan['source_sha256'].items():
        if digest((ROOT/name).read_bytes())!=sha:raise ValueError('Frozen source changed: '+name)
    with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==BODY_SHA
    assert digest(Path(initial_head).read_bytes())==plan['initial_head_sha256']
    for name,sha in plan['data_files'].items():assert digest((ROOT/name).read_bytes())==sha
    if not mechanics and not torch.cuda.is_available():raise ValueError('Quality duration study requires the explicitly allocated GPU')
    (output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');trials=[];deadline=started+max_seconds
    for arm in ('control','adapter'):
        trials.append(run_trial(output/f'{arm}-42',base,initial_head,arm,42,deadline,mechanics))
    pilot=trials[-1];expanded=False
    if not mechanics and pilot.get('best') and pilot['best']['gate']['passed'] and pilot['actual_steps']>=MIN_STEPS:
        expanded=True
        for seed in (17,73):
            if deadline-time.monotonic()<120:break
            trials.append(run_trial(output/f'adapter-{seed}',base,initial_head,'adapter',seed,deadline))
    selected=[r for r in trials if r['arm']=='adapter']
    qualified=not mechanics and len(selected)==3 and all(r['actual_steps']>=MIN_STEPS and r['best']['gate']['passed'] for r in selected)
    result={'study':'adapter-v6','trials':trials,'expanded':expanded,'qualified_for_fresh_test':qualified,'seconds':time.monotonic()-started,
        'test_policy':'No fresh-test inference in training; later native parity and all three fixed seeds required',
        'new_test_inference':False,'physical_device_tested':False,'human_reviewed':False,'mechanics_only':mechanics}
    (output/'result.json').write_text(json.dumps(result,indent=2)+'\n');print('STUDY_DONE',json.dumps(result),flush=True);return result


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--initial-head',required=True);p.add_argument('--max-seconds',type=int,default=2400);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args()
    run(a.output,a.base,a.initial_head,a.max_seconds,a.mechanics_only)

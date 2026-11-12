"""Composition training, paired checkpoint selectors, fixed calibration policies.
All decisions use train/dev/calibration or consumed guards, never sealed tests.
"""
import argparse,gc,hashlib,json,random,time
from pathlib import Path
import torch
from corpus import ROOT,digest,load_data
from facts_v7 import JOINT,score,apply
from facts_v7_study import Sampler,setup,evaluate
from scope_v8_factor_head import FactorHead
from certainty_adapter import representation,disabled,export,restore
from adapter_study import inputs,features
from scope_v9_data import DATA
import scope_v8_typed_calibration as typed
PLAN=ROOT/'verification/scope-v9-plan-20261112.json'
CHECKS=(0,250,500,1000,1500,2000,3000,4000,5000,6000,7000,8000)
PRIORITY=('safety-typed','semantic-typed','safety-global','semantic-global')


def accept(pred,policy):
 i,p=pred;t=policy['threshold'] if policy['kind']=='global' else policy['thresholds'][i]
 return t is not None and p>=t


def decisions(pred,policy):return [(i,float(accept((i,p),policy))) for i,p in pred]


def policies(rows,pred):
 typed.GRID=(None,)+tuple(i/100 for i in range(50,100));tc=typed.calibrate(rows,pred)
 grid=[]
 for t in (.5,.7,.85,.95,.99):
  m=score(rows,pred,t);fallback=sum(r['label']!=14 and i==14 and p>=t for r,(i,p) in zip(rows,pred));grid.append({'kind':'global','threshold':t,'metrics':m,'unmeasured_reference_fallback':fallback,'key':(m['false_proposals']==0 and fallback==0,m['correct_effective']+m['correct_corrections'],t)})
 g=max(grid,key=lambda p:tuple(p['key']));tc={'kind':'typed',**tc}
 return {'typed':tc,'global':g}


def proposal_map(rows,recipes,pred,baseline,policy):
 out={}
 for row in rows:
  value=pred[row['utterance']];fact=JOINT[value[0]];fallback=baseline[row['id']]
  if accept(value,policy) and (fact[0]=='other' or (fact[1]=='nonassertion' and fallback['intent']!='report')):out[row['id']]=fallback;continue
  if not accept(value,policy):out[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};continue
  recipe=recipes[row['recipe_id']];state={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  v=apply(fact,state,recipe['id'],'v1');out[row['id']]={'intent':'report' if v['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in v['changes']],'requiresReview':True}
 return out


def transfer_from_predictions(rows,recipes,guard,recs,pred,policy):
 from certainty_train import BASE,compact
 from reference_train import metrics
 from research_metric_audit import measure
 baseline=json.loads((ROOT/'runs/certainty-v5-r1/native-baseline.json').read_text())['validation'];gb={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']}
 m=metrics(rows,recipes,proposal_map(rows,recipes,pred,baseline,policy));g=metrics(guard,recs,proposal_map(guard,recs,pred,gb,policy));lookup={r['id']:r for r in rows};effective=measure(rows,m['cases'])
 cor=[c for c in m['cases'] if any(not q['done'] and q['actionId'] in lookup[c['id']]['state']['completed'] for q in c['gold']['changes'])]
 return {'old':compact(m),'effective':effective,'corrections_correct':sum(c['actual']['changes']==c['gold']['changes'] for c in cor),'guard':compact(g)}


def checks(cal,transfer,parity,steps,invariant):
 m=cal['metrics'];g=transfer['guard']
 return {'new_false':m['false_proposals']==0,'new_effective':m['effective_recall']>=.75,'new_corrections':m['correction_recall']>=.75,'no_unmeasured_fallback':cal['unmeasured_reference_fallback']==0,
 'old_false':transfer['old']['false_updates']==0,'old_effective':transfer['effective']['effective_update_recall']>=.75,'old_corrections':transfer['corrections_correct']>=12,
 'guard_false':g['false_updates']<=3,'guard_exact':g['exact_proposals']>=294,'guard_recall':g['update_recall']>=.876551724137931,'native_parity':parity==0,'minimum_updates':steps>=4000,'backbone_invariant':invariant}


def save(path,head,model,step,seed):
 torch.save({'head':{k:v.detach().cpu().clone() for k,v in head.state_dict().items()},'adapters':export(model),'step':step,'seed':seed,'head_type':'factor-product'},path)


def trial(output,base,seed,deadline,mechanics=False):
 from transformers import AutoTokenizer,AutoModelForTokenClassification
 output.mkdir(parents=True,exist_ok=False);start=time.monotonic();device='cuda' if torch.cuda.is_available() else 'cpu';torch.set_num_threads(2);torch.manual_seed(seed)
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').to(device).eval();tok=AutoTokenizer.from_pretrained(base,local_files_only=True);info=setup(model,'factor-wide');model.eval()
 torch.manual_seed(seed);head=FactorHead().to(device);opt=torch.optim.AdamW([{'params':head.parameters(),'lr':3e-4},{'params':[p for p in model.parameters() if p.requires_grad],'lr':5e-5}],weight_decay=.01)
 data=json.loads(DATA.read_text())['splits'];train=data['train'];dev=data['dev'];cal=data['calibration'];rng=random.Random(20261112);sample=[]
 for label in range(15):sample += rng.sample([r for r in train if r['label']==label],20)
 if mechanics:train=[next(r for r in train if r['label']==i) for i in range(15)];dev=dev[:8];cal=cal[:8];sample=sample[:8]
 sampler=Sampler(train,seed);torch.manual_seed(seed);best={};stale={'semantic':0,'safety':0};actual=0;losses=[];stop='max_updates';schedule=(0,2) if mechanics else CHECKS
 lx=inputs(tok,['הוספתי קמח','לא ערבבתי'],device)
 with torch.no_grad(),disabled(model):before=model(**lx).logits.cpu().clone()
 if device=='cuda':torch.cuda.reset_peak_memory_stats()
 for step in range((2 if mechanics else 8000)+1):
  if time.monotonic()>deadline:stop='study_deadline';break
  if step:
   idx=sampler.batch();head.train();opt.zero_grad(set_to_none=True);x=representation(model,inputs(tok,[train[i]['text'] for i in idx],device),tok.sep_token_id)
   loss=head.loss(x,torch.tensor([train[i]['label'] for i in idx],device=device));loss.backward();torch.nn.utils.clip_grad_norm_([p for q in opt.param_groups for p in q['params']],1.);opt.step();actual=step;losses.append(float(loss.detach()))
  if step not in schedule:continue
  fx=features(model,tok,[r['text'] for r in sample+dev],device);tm=evaluate(head,fx[:len(sample)],sample);dm=evaluate(head,fx[len(sample):],dev);dp=policies(dev,dm['predictions'])['typed'];d=dp['metrics']
  keys={'semantic':(dm['macro_accuracy'],-dm['nll']),'safety':(dp['passed'],d['correct_effective']+d['correct_corrections'],d['true_proposals'],dm['macro_accuracy'],-dm['nll'])}
  for name,key in keys.items():
   if name not in best or key>tuple(best[name]['key']):best[name]={'step':step,'key':key,'dev':{k:v for k,v in dm.items() if k!='predictions'},'dev_policy':{k:v for k,v in d.items() if k!='failures'}};stale[name]=0;save(output/f'{name}-best.pt',head,model,step,seed)
   else:stale[name]+=1
  point={'seed':seed,'step':step,'seconds':time.monotonic()-start,'train':{k:v for k,v in tm.items() if k!='predictions'},'dev':{k:v for k,v in dm.items() if k!='predictions'},'dev_typed':{k:v for k,v in d.items() if k!='failures'},'best_steps':{k:v['step'] for k,v in best.items()},'stale':stale.copy(),'batch_loss':sum(losses)/len(losses) if losses else None,'examples_seen':step*8,'sampling':'Balanced15 classes, not literal uniform epochs'}
  losses=[]
  with (output/'curve.jsonl').open('a') as f:f.write(json.dumps(point)+'\n')
  (output.parent/'progress.json').write_text(json.dumps(point)+'\n');print(json.dumps(point),flush=True)
  torch.save({'head':head.state_dict(),'adapters':export(model),'optimizer':opt.state_dict(),'sampler_rng':sampler.rng.getstate(),'sampler_pending':sampler.pending,'torch_rng':torch.get_rng_state(),'cuda_rng':torch.cuda.get_rng_state_all() if device=='cuda' else [],'step':step},output/'last.pt')
  if not mechanics and step>=4000 and all(v>=4 for v in stale.values()):stop='both_selectors_plateau_after_min4000';break
 with torch.no_grad(),disabled(model):after=model(**lx).logits.cpu()
 invariant=torch.equal(before,after)
 if not invariant:raise ValueError('Frozen body changed')
 memory=torch.cuda.max_memory_allocated() if device=='cuda' else None;gpu={}
 for selector in ('safety','semantic'):
  state=torch.load(output/f'{selector}-best.pt',map_location=device,weights_only=True);head.load_state_dict(state['head']);restore(model,state['adapters']);cm=evaluate(head,features(model,tok,[r['text'] for r in cal],device),cal);gpu[selector]={'raw':cm,'policies':policies(cal,cm['predictions'])}
 del opt;gc.collect();model=model.to('cpu');head=head.to('cpu');variants={}
 if not mechanics:
  fixture=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());old=fixture['rows'];recipes={r['id']:r for r in fixture['recipes']};recs,orows=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in orows if r['split']=='validation' and r.get('evaluation_kind')!='state'];texts=list(dict.fromkeys(r['utterance'] for r in old+guard))
  for selector in ('safety','semantic'):
   state=torch.load(output/f'{selector}-best.pt',map_location='cpu',weights_only=True);head.load_state_dict(state['head']);restore(model,state['adapters']);cp=evaluate(head,features(model,tok,[r['text'] for r in cal],'cpu'),cal)['predictions'];op=evaluate(head,features(model,tok,texts,'cpu'),[{'label':14} for t in texts])['predictions'];pred=dict(zip(texts,op))
   for kind in ('typed','global'):
    policy=gpu[selector]['policies'][kind];parity=sum(a!=b for a,b in zip(decisions(cp,policy),decisions(gpu[selector]['raw']['predictions'],policy)));oldmetrics=transfer_from_predictions(old,recipes,guard,recs,pred,policy);gate=checks(policy,oldmetrics,parity,actual,invariant)
    variants[selector+'-'+kind]={'selector':selector,'kind':kind,'checkpoint':selector+'-best.pt','best':best[selector],'calibration':policy,'transfer':oldmetrics,'native_calibration_examples':len(cal),'native_gate_mismatches':parity,'checks':gate,'qualified':all(gate.values())}
 result={'seed':seed,'arm':'factor-wide','actual_steps':actual,'stop_reason':stop,'selectors':best,'variants':variants,'gpu_calibration':gpu,'seconds':time.monotonic()-start,'memory_bytes':memory,'legacy_disabled_equal':invariant,'encoder':info,'new_test_inference':False,'mechanics_only':mechanics}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print('TRIAL_DONE',json.dumps({'seed':seed,'steps':actual,'qualified':{k:v['qualified'] for k,v in variants.items()}}),flush=True)
 del model,head;gc.collect()
 if device=='cuda':torch.cuda.empty_cache()
 return result


def can_start_trial(elapsed,max_seconds,mechanics):return mechanics or elapsed<=max_seconds-240


def run(output,base,max_seconds=2100,mechanics=False):
 output=Path(output);output.mkdir(parents=True,exist_ok=False);start=time.monotonic();plan=json.loads(PLAN.read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 if not mechanics and not torch.cuda.is_available():raise ValueError('Quality requires GPU')
 (output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');trials=[];active=set(PRIORITY)
 for seed in ((42,) if mechanics else (42,17,73)):
  if not can_start_trial(time.monotonic()-start,max_seconds,mechanics):break
  t=trial(output/f'seed-{seed}',base,seed,start+max_seconds,mechanics);trials.append(t)
  if not mechanics:active&={k for k,v in t['variants'].items() if v['qualified']}
  (output/'partial.json').write_text(json.dumps({'trials':trials,'eligible_methods':sorted(active),'qualified_for_test':False},ensure_ascii=False)+'\n')
  if not mechanics and not active:break
 qualified=not mechanics and len(trials)==3 and bool(active);method=next((m for m in PRIORITY if m in active),None) if qualified else None
 result={'study':'scope-v9','trials':trials,'selected_method':method,'eligible_methods':sorted(active) if not mechanics else [],'qualified_for_test':qualified,'seconds':time.monotonic()-start,'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False,'mechanics_only':mechanics}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--max-seconds',type=int,default=2100);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args();run(a.output,a.base,a.max_seconds,a.mechanics_only)

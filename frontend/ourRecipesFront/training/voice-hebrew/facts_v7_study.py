"""Controlled V7 pilot: same data/backbone/sampler, flat vs factored then scope.
No test inference. Full fine-tuning is a separate body, not a drop-in shared encoder.
"""
import argparse,gc,hashlib,json,random,time
from collections import defaultdict
from pathlib import Path
import torch
from corpus import ROOT,digest,load_data
from facts_v7 import DATA,JOINT,REFS,COMMIT,STATUS,score,apply
from adapter_study import inputs,features,BODY_SHA,CHECKS
from certainty_adapter import representation,install,AdapterLinear,export,restore,modules,disabled

ARMS=('flat-narrow','factor-narrow','factor-wide','factor-full')
ATTR=(REFS,COMMIT,STATUS)

class Head(torch.nn.Module):
 def __init__(self,flat=False):
  super().__init__();self.flat=flat
  self.net=torch.nn.Sequential(torch.nn.LayerNorm(3072),torch.nn.Linear(3072,128),torch.nn.GELU(),torch.nn.Dropout(.1),torch.nn.Linear(128,15 if flat else 11))
 def forward(self,x):return self.net(x)
 def logprobs(self,x):
  z=self(x)
  if self.flat:return z.log_softmax(-1)
  parts=[p.log_softmax(-1) for p in z.split((3,4,4),dim=-1)]
  joint=torch.stack([sum(parts[i][:,ATTR[i].index(v)] for i,v in enumerate(fact)) for fact in JOINT],dim=-1)
  return joint.log_softmax(-1)
 def loss(self,x,y):
  z=self(x)
  if self.flat:return torch.nn.functional.cross_entropy(z,y)
  truth=torch.tensor([[ATTR[i].index(v) for i,v in enumerate(JOINT[k])] for k in y.tolist()],device=z.device)
  return sum(torch.nn.functional.cross_entropy(p,truth[:,i]) for i,p in enumerate(z.split((3,4,4),dim=-1)))/3


def setup(model,arm):
 for p in model.parameters():p.requires_grad_(False)
 if arm.endswith('narrow'):install(model,8,2)
 elif arm.endswith('wide'):
  targets=[(name,m) for name,m in model.named_modules() if name.startswith('bert.encoder.layer.') and isinstance(m,torch.nn.Linear)]
  for name,m in targets:
   parent,key=name.rsplit('.',1);setattr(model.get_submodule(parent),key,AdapterLinear(m,8,8))
 elif arm.endswith('full'):
  for p in model.bert.parameters():p.requires_grad_(True)
 else:raise ValueError('Unknown arm')
 return {'trainable_encoder_parameters':sum(p.numel() for p in model.parameters() if p.requires_grad),'adapter_modules':list(modules(model))}

class Sampler:
 def __init__(self,rows,seed):
  self.rng=random.Random(seed);self.b=defaultdict(list);self.pending=[]
  for i,r in enumerate(rows):self.b[r['label']].append(i)
  if set(self.b)!=set(range(15)):raise ValueError('Missing joint class')
 def batch(self):
  out=[]
  for _ in range(8):
   if not self.pending:self.pending=list(range(15));self.rng.shuffle(self.pending)
   out.append(self.rng.choice(self.b[self.pending.pop()]))
  return out


def evaluate(head,x,rows):
 head.eval();y=torch.tensor([r['label'] for r in rows],device=x.device)
 with torch.no_grad():
  lp=head.logprobs(x);p,i=lp.exp().max(-1);acc=i==y;nll=-lp[torch.arange(len(y),device=x.device),y]
 return {'macro_accuracy':sum(float(acc[y==k].float().mean()) for k in y.unique())/len(y.unique()),'nll':float(nll.mean()),
 'accuracy':float(acc.float().mean()),'predictions':list(zip(i.cpu().tolist(),p.cpu().tolist()))}


def guard(model,tok,head,threshold,device,limit=None):
 from certainty_train import BASE,compact
 from reference_train import metrics
 recs,rows=load_data(ROOT/'runs/state-v13-preflight/shared');rows=[r for r in rows if r['split']=='validation' and r.get('evaluation_kind')!='state']
 if limit:rows=rows[:limit]
 baseline={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']}
 x=features(model,tok,[r['utterance'] for r in rows],device);pred=evaluate(head,x,[{'label':14} for r in rows])['predictions'];out={}
 for row,(label,p) in zip(rows,pred):
  fallback=baseline[row['id']];fact=JOINT[label]
  if p>=threshold and fact[0]=='other':out[row['id']]=fallback;continue
  if p>=threshold and fact[1]=='nonassertion' and fallback['intent']!='report':out[row['id']]=fallback;continue
  if p<threshold:out[row['id']]={'intent':'clarify','changes':[],'requiresReview':True};continue
  recipe=recs[row['recipe_id']];state={'recipe_id':recipe['id'],'recipe_version':'v1','current_step':row['state']['currentStep'],
   'actions':[{'id':a['id'],'step':a['step']} for a in recipe['actions']],**{k:row['state'][k] for k in ('completed','remaining')}}
  value=apply(fact,state,recipe['id'],'v1')
  out[row['id']]={'intent':'report' if value['changes'] else 'clarify','changes':[{'actionId':c['action_id'],'done':c['completed'],'evidence':row['utterance']} for c in value['changes']],'requiresReview':True}
 return compact(metrics(rows,recs,out))


def trial(output,base,arm,seed,deadline,mechanics=False):
 from transformers import AutoTokenizer,AutoModelForTokenClassification
 start=time.monotonic();output.mkdir(parents=True,exist_ok=False);device='cuda' if torch.cuda.is_available() else 'cpu';torch.manual_seed(seed);torch.set_num_threads(2)
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').to(device).eval();tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 info=setup(model,arm);model.eval()
 # Initialize shared head trunk with an independent reset, not RNG consumed by LoRA.
 torch.manual_seed(seed);head=Head(arm.startswith('flat')).to(device)
 opt=torch.optim.AdamW([{'params':head.parameters(),'lr':3e-4},{'params':[p for p in model.parameters() if p.requires_grad],'lr':1e-5 if arm.endswith('full') else 5e-5}],weight_decay=.01)
 data=json.loads(DATA.read_text())['splits'];train=data['train'];dev=data['dev'];cal=data['calibration']
 if mechanics:
  train=[next(r for r in train if r['label']==i) for i in range(15)];dev=dev[:4];cal=cal[:4]
 sampler=Sampler(train,seed);torch.manual_seed(seed);best=None;stale=0;step=0;history=[];schedule=(0,2) if mechanics else CHECKS
 if device=='cuda':torch.cuda.reset_peak_memory_stats()
 # These fixed, gold-free inputs prove disabling LoRA restores unchanged base.
 lx=inputs(tok,['הוספתי קמח','לא ערבבתי'],device)
 with torch.no_grad(),disabled(model):before=model(**lx).logits.cpu().clone()
 for step in range((2 if mechanics else 3000)+1):
  if time.monotonic()>deadline:break
  if step:
   idx=sampler.batch();head.train();opt.zero_grad(set_to_none=True)
   x=representation(model,inputs(tok,[train[i]['text'] for i in idx],device),tok.sep_token_id)
   loss=head.loss(x,torch.tensor([train[i]['label'] for i in idx],device=device));loss.backward();torch.nn.utils.clip_grad_norm_([p for g in opt.param_groups for p in g['params']],1);opt.step()
  if step not in schedule:continue
  vx=features(model,tok,[r['text'] for r in dev],device);m=evaluate(head,vx,dev);key=(m['macro_accuracy'],-m['nll']);improved=best is None or key>tuple(best['key'])
  if improved:
   best={'step':step,'key':key,'dev':{k:v for k,v in m.items() if k!='predictions'}};stale=0
   torch.save({'head':head.state_dict(),'adapters':export(model),'arm':arm,'seed':seed,'step':step},output/'best.pt')
   if arm.endswith('full'):
    from safetensors.torch import save_file
    save_file({k:v.detach().cpu().contiguous() for k,v in model.state_dict().items()},str(output/'best-body.safetensors'))
  else:stale+=1
  point={'arm':arm,'seed':seed,'step':step,'seconds':time.monotonic()-start,'best_step':best['step'],**{k:v for k,v in m.items() if k!='predictions'},'policy_0_85':{k:v for k,v in score(dev,m['predictions'],.85).items() if k!='failures'}}
  history.append(point)
  with (output/'curve.jsonl').open('a') as f:f.write(json.dumps(point)+'\n')
  (output.parent/'progress.json').write_text(json.dumps(point)+'\n');print(json.dumps(point),flush=True)
  if not arm.endswith('full'):
   torch.save({'head':head.state_dict(),'adapters':export(model),'optimizer':opt.state_dict(),'sampler_rng':sampler.rng.getstate(),'sampler_pending':sampler.pending,'torch_rng':torch.get_rng_state(),'cuda_rng':torch.cuda.get_rng_state_all() if device=='cuda' else [],'step':step},output/'last.pt')
  if not mechanics and step>=2000 and stale>=4:break
 with torch.no_grad(),disabled(model):after=model(**lx).logits.cpu()
 invariant=torch.equal(before,after)
 if not arm.endswith('full') and not invariant:raise ValueError('Frozen legacy changed')
 state=torch.load(output/'best.pt',weights_only=True,map_location=device);head.load_state_dict(state['head']);restore(model,state['adapters'])
 if arm.endswith('full'):
  from safetensors.torch import load_file
  model.load_state_dict(load_file(str(output/'best-body.safetensors'),device=device))
 cx=features(model,tok,[r['text'] for r in cal],device);cm=evaluate(head,cx,cal)
 grid=[]
 for t in (.5,.7,.85,.95,.99):
  s=score(cal,cm['predictions'],t);grid.append({'threshold':t,'key':(s['false_proposals']==0,s['correct_effective']+s['correct_corrections']-5*s['false_proposals'],t),'metrics':s})
 chosen=max(grid,key=lambda r:tuple(r['key']));g=guard(model,tok,head,chosen['threshold'],device,4 if mechanics else None)
 checks={'effective_recall':chosen['metrics']['effective_recall']>=.75,'correction_recall':chosen['metrics']['correction_recall']>=.75,'zero_false_new_proposals':chosen['metrics']['false_proposals']==0,
 'guard_false':g['false_updates']<=3,'guard_exact':g['exact_proposals']>=294,'guard_recall':g['update_recall']>=.876551724137931}
 result={'arm':arm,'seed':seed,'best':best,'actual_steps':step,'stop_reason':'max_steps' if step==3000 else ('mechanics' if mechanics else 'plateau_or_deadline'),
 'calibration':cm,'threshold_grid':grid,'selected':chosen,'guard':g,'gates':checks,'passed':all(checks.values()) and not mechanics,'seconds':time.monotonic()-start,
 'memory_bytes':torch.cuda.max_memory_allocated() if device=='cuda' else None,'encoder':info,'head_parameters':sum(p.numel() for p in head.parameters()),'legacy_disabled_equal':invariant,
 'legacy_fallback':'Saved unchanged f053 T4 outputs; full tuned encoder requires separate original body for fallback','full_optimizer_saved':False,'new_test_inference':False,'mechanics_only':mechanics}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print('TRIAL_DONE',json.dumps({k:v for k,v in result.items() if k not in ('threshold_grid','calibration','selected')}),flush=True)
 del model,head,opt;gc.collect()
 if device=='cuda':torch.cuda.empty_cache()
 return result


def run(output,base,max_seconds=2400,mechanics=False):
 output=Path(output);output.mkdir(parents=True,exist_ok=False);start=time.monotonic();plan=json.loads((ROOT/'verification/facts-v7-plan-20261112.json').read_text())
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==BODY_SHA
 if not mechanics and not torch.cuda.is_available():raise ValueError('GPU required for quality experiment')
 (output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');results=[]
 for arm in ARMS:
  results.append(trial(output/f'{arm}-42',base,arm,42,start+max_seconds,mechanics))
 result={'study':'facts-v7','trials':results,'seconds':time.monotonic()-start,'new_test_inference':False,'physical_device_tested':False,'human_reviewed':False,'mechanics_only':mechanics}
 # Seed expansion is a separate run only after native parity and pilot gates.
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--max-seconds',type=int,default=2400);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args();run(a.output,a.base,a.max_seconds,a.mechanics_only)

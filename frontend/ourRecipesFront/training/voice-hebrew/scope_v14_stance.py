"""Separate stance LoRA on the unchanged body; original V12 adapters preserved."""
import json,time,random
from pathlib import Path
import torch
from corpus import ROOT,digest
from adapter_study import features,inputs
from facts_v7_study import setup
from certainty_adapter import representation,disabled,export,restore
from scope_v13_data import DATA
from scope_v13_stance import StanceHead,probabilities,calibrate
PLAN=ROOT/'verification/scope-v14-stance-plan-20261112.json'


def predict(model,tok,head,texts,device):return probabilities(head,features(model,tok,texts,device))


def known_sets():
 from scope_v9_data import DATA as OLD
 from facts_v7_replay import REPLAY
 from corpus import load_data
 old=json.loads(OLD.read_text())['splits'];sets={}
 paths=('runs/colab-scope-v9-guarded/recovered/study/seed-42/result.json','runs/colab-scope-v9-guarded/recovered/study/seed-17/result.json','runs/colab-scope-v10-consensus/recovered/study/seed-73/result.json')
 members=[json.loads((ROOT/p).read_text()) for p in paths];policies=[m['policy'] for m in members]
 sets['old_calibration']=(old['calibration'],[m['raw_cpu_calibration'] for m in members])
 for name,filename,rows in (('consumed_v8','scope-v8',old['test']),('consumed_v7','retained-v7',json.loads(REPLAY.read_text())['splits']['test'])):
  sets[name]=(rows,json.loads((ROOT/f'runs/scope-v12-evidence/fresh-test-once/{filename}.json').read_text())['raw'])
 cache=json.loads((ROOT/'verification/scope-v10-consensus-feasibility-20261112.json').read_text())['raw_native'];third=json.loads((ROOT/'verification/scope-v12-evidence-development-20261112.json').read_text())['raw_third_native'];f=json.loads((ROOT/'verification/certainty-v5-data-20261112/validation.json').read_text());recs,orig=load_data(ROOT/'runs/state-v13-preflight/shared')
 return sets,policies,cache['texts'],cache['members']+[third],f['rows'],{r['id']:r for r in f['recipes']},[r for r in orig if r['split']=='validation' and r.get('evaluation_kind')!='state'],recs


def regression(probability_lookup,threshold):
 from scope_v13_eval import compose,native
 from scope_v10_consensus import measure as measure_decisions
 sets,policies,texts,records,old,recipes,guard,recs=known_sets();results={}
 for name,(rows,rs) in sets.items():
  ts=[r['text'] for r in rows];results[name]=measure_decisions(rows,compose(ts,rs,policies,[probability_lookup[t] for t in ts],threshold))
 n=native(old,recipes,guard,recs,dict(zip(texts,compose(texts,records,policies,[probability_lookup[t] for t in texts],threshold))))
 return {'sets':results,'native':n,'passed':all(v['passed'] for v in results.values()) and n['passed'],'all_sets_consumed_regression_only':True,'consumed_v7_training_replay':True}


def trial(folder,base,seed,deadline,mechanics=False):
 from transformers import AutoTokenizer,AutoModelForTokenClassification
 folder=Path(folder);folder.mkdir(parents=True,exist_ok=False);start=time.monotonic();device='cuda' if torch.cuda.is_available() else 'cpu';torch.set_num_threads(2);torch.manual_seed(seed)
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').to(device).eval();setup(model,'factor-wide');torch.manual_seed(seed);head=StanceHead('mlp64').to(device);tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 init=ROOT/'runs/guarded-seed42-material/model.pt';assert digest(init.read_bytes())=='4982f0b35785f51c0494db52c53ba561b62f7bc6e9ed38092544fc84fe34fe8a'
 state=torch.load(init,weights_only=True,map_location=device);restore(model,state['adapters']);del state
 opt=torch.optim.AdamW([{'params':head.parameters(),'lr':3e-4},{'params':[p for p in model.parameters() if p.requires_grad],'lr':5e-5}],weight_decay=.01)
 if device=='cuda':torch.cuda.reset_peak_memory_stats()
 data=json.loads(DATA.read_text())['splits'];train=data['train'];dev=data['dev'];cal=data['calibration'];rng=random.Random(seed);buckets={k:[i for i,r in enumerate(train) if r['allow']==k] for k in (0,1)};best=None;stale=0;actual=0
 if mechanics:dev=dev[:8];cal=cal[:8]
 lx=inputs(tok,['הוספתי קמח','אולי הוספתי קמח'],device)
 with torch.no_grad(),disabled(model):before=model(**lx).logits.cpu().clone()
 schedule=(0,2) if mechanics else (0,100,200,500,1000,1500,2000,2500,3000)
 def save(path,step):torch.save({'head':{k:v.detach().cpu().clone() for k,v in head.state_dict().items()},'adapters':export(model),'arm':'mlp64-stance-lora','seed':seed,'step':step},path)
 for step in range((2 if mechanics else 3000)+1):
  if time.monotonic()>deadline:break
  if step:
   idx=[rng.choice(buckets[k]) for k in (0,1) for _ in range(4)];rng.shuffle(idx);head.train();opt.zero_grad(set_to_none=True);x=representation(model,inputs(tok,[train[i]['text'] for i in idx],device),tok.sep_token_id);loss=torch.nn.functional.cross_entropy(head(x),torch.tensor([train[i]['allow'] for i in idx],device=device));loss.backward();norm=torch.nn.utils.clip_grad_norm_([p for g in opt.param_groups for p in g['params']],1.);opt.step();actual=step
   with (folder/'losses.jsonl').open('a') as f:f.write(json.dumps({'step':step,'loss':float(loss.detach()),'gradient_norm_before_clip':float(norm),'batch_indices_sha256':digest(json.dumps(idx).encode())})+'\n')
  if step not in schedule:continue
  x=features(model,tok,[r['text'] for r in dev],device);head.eval()
  with torch.no_grad():z=head(x);y=torch.tensor([r['allow'] for r in dev],device=device);nll=float(torch.nn.functional.cross_entropy(z,y));acc=float((z.argmax(-1)==y).float().mean())
  p=probabilities(head,x);key=(acc,-nll)
  if best is None or key>tuple(best['key']):best={'step':step,'key':key,'accuracy':acc,'nll':nll};save(folder/'best.pt',step);stale=0
  else:stale+=1
  point={'seed':seed,'step':step,'seconds':time.monotonic()-start,'dev_accuracy':acc,'dev_nll':nll,'dev_allow_probabilities':p,'best_step':best['step'],'stale':stale};(folder/f'dev-{step}.json').write_text(json.dumps(point,indent=2)+'\n')
  with (folder/'curve.jsonl').open('a') as f:f.write(json.dumps({k:v for k,v in point.items() if k!='dev_allow_probabilities'})+'\n')
  (folder.parent/'progress.json').write_text(json.dumps({k:v for k,v in point.items() if k!='dev_allow_probabilities'})+'\n');print(json.dumps({k:v for k,v in point.items() if k!='dev_allow_probabilities'}),flush=True)
  torch.save({'head':head.state_dict(),'adapters':export(model),'optimizer':opt.state_dict(),'python_rng':rng.getstate(),'torch_rng':torch.get_rng_state(),'cuda_rng':torch.cuda.get_rng_state_all() if device=='cuda' else [],'seed':seed,'step':step},folder/'last.pt')
  if not mechanics and step>=1000 and stale>=3:break
 with torch.no_grad(),disabled(model):after=model(**lx).logits.cpu()
 invariant=torch.equal(before,after);assert invariant
 state=torch.load(folder/'best.pt',weights_only=True,map_location=device);head.load_state_dict(state['head']);restore(model,state['adapters']);gpu=predict(model,tok,head,[r['text'] for r in cal],device);policy=calibrate(cal,gpu);model.to('cpu');head.to('cpu');cpu=predict(model,tok,head,[r['text'] for r in cal],'cpu');parity=sum((a>=policy['threshold'])!=(b>=policy['threshold']) for a,b in zip(gpu,cpu));delta=max(abs(a-b) for a,b in zip(gpu,cpu));assert parity==0 and delta<1e-4
 reg=None
 if not mechanics and policy['metrics']['passed']:
  sets,policies,texts,*rest=known_sets();alltexts=list(dict.fromkeys([r['text'] for rows,rs in sets.values() for r in rows]+texts));model.to(device);head.to(device);p=predict(model,tok,head,alltexts,device);lookup=dict(zip(alltexts,p));(folder/'known-probabilities.json').write_text(json.dumps(lookup,ensure_ascii=False,indent=2)+'\n');reg=regression(lookup,policy['threshold'])
 result={'arm':'mlp64-stance-lora','seed':seed,'actual_updates':actual,'best':best,'calibration':policy,'gpu_calibration_probabilities':gpu,'cpu_calibration_probabilities':cpu,'parity':{'examples':len(cal),'decision_mismatches':parity,'max_probability_delta':delta},'regression':reg,'qualified':not mechanics and actual>=1000 and policy['metrics']['passed'] and reg is not None and reg['passed'],'body_unchanged_when_disabled':invariant,'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'checkpoint_bytes':(folder/'best.pt').stat().st_size,'peak_gpu_allocated_bytes':torch.cuda.max_memory_allocated() if device=='cuda' else None,'seconds':time.monotonic()-start,'mechanics_only':mechanics,'fresh_test_inference':False}
 (folder/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result


def run(output,base,max_seconds=1800,mechanics=False):
 import hashlib
 plan=json.loads(PLAN.read_text())
 for n,h in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==h,n
 for n,h in plan['input_artifacts'].items():assert digest((ROOT/n).read_bytes())==h,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 if not mechanics and not torch.cuda.is_available():raise ValueError('Actual T4/GPU required for this quality study')
 output=Path(output);output.mkdir(parents=True,exist_ok=False);(output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');start=time.monotonic();trials=[]
 for seed in ((42,) if mechanics else (42,17,73)):
  if not mechanics and time.monotonic()-start>max_seconds-420:break
  r=trial(output/f'seed-{seed}',base,seed,start+max_seconds,mechanics);trials.append(r)
  if not mechanics and not r['qualified']:break
 result={'study':'scope-v14-stance-lora','trials':trials,'qualified_for_fresh_test':not mechanics and len(trials)==3 and all(t['qualified'] for t in trials),'seconds':time.monotonic()-start,'mechanics_only':mechanics,'fresh_test_inference':False}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result


if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--max-seconds',type=int,default=1800);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args();run(a.output,a.base,a.max_seconds,a.mechanics_only)

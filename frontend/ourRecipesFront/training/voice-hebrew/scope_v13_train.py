"""CPU training on frozen seed42 features, two fixed arms and three seeds.
Fresh-test inputs are never featurized or scored here. Every checkpoint records
the reason it wins and last.pt preserves optimizer and RNG for later inspection.
"""
import argparse,json,random,time
from pathlib import Path
import torch
from corpus import ROOT,digest
from scope_v13_data import DATA
from scope_v13_features import MODEL_SHA,BODY_SHA
from scope_v13_log import RUN,event,environment
from scope_v13_stance import StanceHead,probabilities,calibrate
PLAN=ROOT/'verification/scope-v13-stance-plan-20261112.json'
CHECKS=(0,100,200,400,800,1200,1600)


def inspect(head,x,rows):
 head.eval();y=torch.tensor([r['allow'] for r in rows])
 with torch.no_grad():
  z=head(x);nll=float(torch.nn.functional.cross_entropy(z,y));accuracy=float((z.argmax(-1)==y).float().mean())
 p=probabilities(head,x);c=calibrate(rows,p)
 return {'nll':nll,'accuracy':accuracy,'safe':c,'probabilities':p}


def trial(arm,seed,data,cache):
 torch.manual_seed(seed);rng=random.Random(seed);head=StanceHead(arm);opt=torch.optim.AdamW(head.parameters(),lr=1e-3,weight_decay=.01);folder=RUN/'heads'/f'{arm}-{seed}';folder.mkdir(parents=True,exist_ok=False);train=data['train'];dev=data['dev'];by={k:[i for i,r in enumerate(train) if r['allow']==k] for k in (0,1)};best=None;stale=0;start=time.monotonic();history=[]
 event('head_training_started',arm=arm,seed=seed,parameters=sum(p.numel() for p in head.parameters()),learning_rate=.001,weight_decay=.01,batch=64,encoder_updated=False)
 for step in range(1601):
  if step:
   idx=[rng.choice(by[k]) for k in (0,1) for _ in range(32)];rng.shuffle(idx);head.train();opt.zero_grad(set_to_none=True);loss=torch.nn.functional.cross_entropy(head(cache['train'][idx]),torch.tensor([train[i]['allow'] for i in idx]));loss.backward();grad_norm=torch.nn.utils.clip_grad_norm_(head.parameters(),1.);opt.step()
   with (folder/'losses.jsonl').open('a') as f:f.write(json.dumps({'step':step,'loss':float(loss.detach()),'gradient_norm_before_clip':float(grad_norm),'batch_indices_sha256':digest(json.dumps(idx).encode()),'learning_rate':.001})+'\n')
  if step not in CHECKS:continue
  m=inspect(head,cache['dev'],dev);safe=m['safe']['metrics'];key=(safe['passed'],safe['unsafe_allowed']==0,safe['asserted_allowed'],m['accuracy'],-m['nll']);improved=best is None or key>tuple(best['key'])
  if improved:
   best={'step':step,'key':key,'dev_nll':m['nll'],'dev_accuracy':m['accuracy'],'dev_safe':m['safe']};stale=0;torch.save({'head':head.state_dict(),'arm':arm,'seed':seed,'step':step,'encoder_sha256':MODEL_SHA},folder/'best.pt')
  else:stale+=1
  point={'step':step,'seconds':time.monotonic()-start,'dev_nll':m['nll'],'dev_accuracy':m['accuracy'],'dev_safe':m['safe'],'best_step':best['step'],'stale':stale,'batch_loss':float(loss.detach()) if step else None};history.append(point)
  torch.save({'head':head.state_dict(),'arm':arm,'seed':seed,'step':step,'encoder_sha256':MODEL_SHA},folder/f'step-{step}.pt')
  (folder/f'dev-{step}.json').write_text(json.dumps({'row_ids':[r['id'] for r in dev],'allow_probabilities':m['probabilities'],'nll':m['nll'],'safe':m['safe']},indent=2)+'\n')
  with (folder/'curve.jsonl').open('a') as f:f.write(json.dumps(point)+'\n')
  torch.save({'head':head.state_dict(),'optimizer':opt.state_dict(),'python_rng':rng.getstate(),'torch_rng':torch.get_rng_state(),'arm':arm,'seed':seed,'step':step,'encoder_sha256':MODEL_SHA},folder/'last.pt');event('head_checkpoint',arm=arm,seed=seed,**point)
  if step>=400 and stale>=3:break
 state=torch.load(folder/'best.pt',weights_only=True);head.load_state_dict(state['head']);cal=inspect(head,cache['calibration'],data['calibration']);policy=cal['safe']
 result={'arm':arm,'seed':seed,'actual_updates':step,'best':best,'calibration':policy,'calibration_probabilities':cal['probabilities'],'calibration_nll':cal['nll'],'qualified_classifier':policy['metrics']['passed'],'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'checkpoint_bytes':(folder/'best.pt').stat().st_size,'head_parameters':sum(p.numel() for p in head.parameters()),'seconds':time.monotonic()-start,'encoder_updated':False,'fresh_test_inference':False,'exact_resume_tested':False}
 (folder/'result.json').write_text(json.dumps(result,indent=2)+'\n');event('head_training_complete',arm=arm,seed=seed,selected_step=best['step'],threshold=policy['threshold'],calibration=policy['metrics'],checkpoint_sha256=result['checkpoint_sha256']);return result


def run():
 torch.set_num_threads(2);plan=json.loads(PLAN.read_text())
 for n,h in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==h,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 manifest=json.loads((RUN/'features/manifest.json').read_text());assert manifest['data_sha256']==plan['data_sha256'] and manifest['checkpoint_sha256']==MODEL_SHA and manifest['body_sha256']==BODY_SHA
 assert digest((RUN/'features/manifest.json').read_bytes())==plan['feature_manifest_sha256']
 data=json.loads(DATA.read_text())['splits'];cache={}
 for split in ('train','dev','calibration'):
  p=RUN/f'features/{split}.pt';assert digest(p.read_bytes())==manifest['splits'][split]['sha256'];v=torch.load(p,weights_only=True);assert v['row_ids']==[r['id'] for r in data[split]];cache[split]=v['features'];assert cache[split].shape==(len(data[split]),3072) and torch.isfinite(cache[split]).all()
 event('training_protocol_started',plan_sha256=digest(PLAN.read_bytes()),environment=environment(),feature_manifest_sha256=digest((RUN/'features/manifest.json').read_bytes()),fresh_test_inference=False)
 trials=[]
 for arm in ('linear','mlp64'):
  for seed in (42,17,73):
   t=trial(arm,seed,data,cache);trials.append(t)
   if not t['qualified_classifier']:event('arm_expansion_stopped',arm=arm,seed=seed,reason='calibration_classifier_gate_failed');break
 result={'trials':trials,'fresh_test_inference':False,'encoder_updated':False,'human_reviewed':False,'physical_device_tested':False}
 (RUN/'training.json').write_text(json.dumps(result,indent=2)+'\n');return result


if __name__=='__main__':run()

"""Post-selection train/dev fitting diagnosis; never selects weights or opens tests."""
import argparse,gc,json,random
from pathlib import Path
from corpus import ROOT,digest
from scope_v8_data import DATA
from facts_v7 import score

def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import Head,setup,evaluate
 from certainty_adapter import restore
 from adapter_study import features
 root=Path(root);study=root/'recovered/study';result=json.loads((study/'result.json').read_text());data=json.loads(DATA.read_text())['splits'];train=data['train'];dev=data['dev'];torch.set_num_threads(2)
 rng=random.Random(20261112);idx=[]
 for label in range(15):idx+=rng.sample([i for i,r in enumerate(train) if r['label']==label],20)
 sample=[train[i] for i in idx];tok=AutoTokenizer.from_pretrained(base,local_files_only=True);proof=[]
 for t in result['trials']:
  if t['seed']!=42:continue
  folder=study/f"{t['arm']}-42";model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,t['arm']);head=Head(True);states=[]
  for checkpoint in ('best.pt','last.pt'):
   state=torch.load(folder/checkpoint,weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters'])
   x=features(model,tok,[r['text'] for r in sample+dev],'cpu');a=evaluate(head,x[:len(sample)],sample);b=evaluate(head,x[len(sample):],dev);m=score(dev,b['predictions'],.85)
   states.append({'checkpoint':checkpoint,'sha256':digest((folder/checkpoint).read_bytes()),'step':state['step'],'train_stratified_sample':{k:v for k,v in a.items() if k!='predictions'},'dev':{k:v for k,v in b.items() if k!='predictions'},'dev_fixed_0_85':{k:v for k,v in m.items() if k!='failures'}})
  proof.append({'arm':t['arm'],'seed':42,'checkpoints':states});del model,head;gc.collect()
 out={'scope':'Post-selection actual CPU fitting diagnosis on known train/dev; same stratified20-per-class300-text sample each arm. No checkpoint, threshold or method changed; no test inference.',
 'train_sample_ids':[r['id'] for r in sample],'trials':proof,'human_reviewed':False,'physical_device_tested':False,'test_inference':False}
 (ROOT/'verification/scope-v8-fit-20261112.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='train_sample_ids'},indent=2));return out

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

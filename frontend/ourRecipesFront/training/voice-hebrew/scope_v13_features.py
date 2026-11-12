"""Real CPU frozen-feature preparation. Never reads fresh tests into the model."""
import argparse,hashlib,json,time
from pathlib import Path
import torch
from corpus import ROOT,digest
from adapter_study import features
from facts_v7 import JOINT
from facts_v7_study import ATTR,setup
from scope_v8_factor_head import FactorHead
from certainty_adapter import restore
from scope_v13_data import DATA
from scope_v13_log import RUN,event,environment
BASE=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run/model'
CHECKPOINT=ROOT/'runs/colab-scope-v9-guarded/recovered/study/seed-42/model.pt'
BODY_SHA='f053074f0118ebdd8157906ef862001135c6b9d6b3e15810e5aca25f6dc30bb4'
MODEL_SHA='4982f0b35785f51c0494db52c53ba561b62f7bc6e9ed38092544fc84fe34fe8a'


def records_from_features(head,x):
 head.eval()
 with torch.no_grad():
  z=head(x);parts=[p.softmax(-1) for p in z.split((3,4,4),dim=-1)];p,i=head.logprobs(x).exp().max(-1)
  values=[v.cpu().tolist() for v in parts];labels=i.cpu().tolist();joint=p.cpu().tolist()
 return [{'label':k,'joint_confidence':joint[n],'components':[values[j][n][ATTR[j].index(v)] for j,v in enumerate(JOINT[k])],'ordinary_score':values[1][n][3]*values[2][n][3]} for n,k in enumerate(labels)]


def load_encoder(base=BASE,checkpoint=CHECKPOINT):
 from transformers import AutoTokenizer,AutoModelForTokenClassification
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==BODY_SHA
 assert digest(Path(checkpoint).read_bytes())==MODEL_SHA
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(checkpoint,weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 return model,tok,head


def run():
 torch.set_num_threads(2);RUN.mkdir(exist_ok=False);folder=RUN/'features';folder.mkdir();start=time.monotonic()
 event('feature_preparation_started',environment=environment(),data_sha256=digest(DATA.read_bytes()),body_sha256=BODY_SHA,checkpoint_sha256=MODEL_SHA,feature_code_sha256=digest(Path(__file__).read_bytes()),fresh_test_inference=False)
 model,tok,head=load_encoder();data=json.loads(DATA.read_text());manifest={}
 for split in ('train','dev','calibration'):
  rows=data['splits'][split];blocks=[];began=time.monotonic();texts=[r['text'] for r in rows]
  encoded=tok(['משמעות של דיווח התקדמות בבישול']*len(texts),texts,truncation=False)
  max_tokens=max(map(len,encoded['input_ids']));unk=sum(v==tok.unk_token_id for seq in encoded['input_ids'] for v in seq)
  assert max_tokens<=512
  for off in range(0,len(texts),256):
   blocks.append(features(model,tok,texts[off:off+256],'cpu'));(RUN/'progress.json').write_text(json.dumps({'phase':'features','split':split,'finished':min(off+256,len(texts)),'total':len(texts)})+'\n')
  x=torch.cat(blocks);p=folder/f'{split}.pt';torch.save({'features':x,'row_ids':[r['id'] for r in rows],'text_sha256':[digest(t.encode()) for t in texts]},p)
  manifest[split]={'rows':len(rows),'shape':list(x.shape),'seconds':time.monotonic()-began,'bytes':p.stat().st_size,'sha256':digest(p.read_bytes()),'maximum_tokens':max_tokens,'unknown_tokens':unk,'truncation':False};event('features_saved',split=split,**manifest[split])
 # This all493 known-calibration parity check proves the new head can share
 # the existing seed42 representation without a fourth encoder pass.
 parent=json.loads((ROOT/'runs/colab-scope-v9-guarded/recovered/study/seed-42/result.json').read_text());old=json.loads((ROOT/'verification/scope-v9-data-20261112.json').read_text())['splits']['calibration'];x=features(model,tok,[r['text'] for r in old],'cpu');actual=records_from_features(head,x);expected=parent['raw_cpu_calibration']
 from scope_v9_guarded import route
 mismatches=sum(route(a,parent['policy'])!=route(b,parent['policy']) for a,b in zip(actual,expected));delta=max(abs(a['joint_confidence']-b['joint_confidence']) for a,b in zip(actual,expected));assert len(actual)==493 and mismatches==0 and delta<1e-4
 proof={'splits':manifest,'body_sha256':BODY_SHA,'checkpoint_sha256':MODEL_SHA,'data_sha256':digest(DATA.read_bytes()),'parity_examples':len(old),'parity_route_mismatches':mismatches,'parity_max_joint_delta':delta,'real_cpu_inference':True,'encoder_parameters_updated':False,'fresh_test_inference':False,'seconds':time.monotonic()-start,'environment':environment()}
 (folder/'manifest.json').write_text(json.dumps(proof,indent=2)+'\n');event('feature_preparation_complete',seconds=proof['seconds'],parity_route_mismatches=mismatches,fresh_test_inference=False);return proof


if __name__=='__main__':run()

"""One opening of V7 synthetic reference test, all fixed seeds, gated beforehand.
Never selects a model or changes thresholds; V5 fresh480 stays closed.
"""
import argparse,gc,hashlib,json,time
from pathlib import Path
from corpus import ROOT,digest
from facts_v7 import JOINT,score
from facts_v7_replay import REPLAY,PLAN

def run(root,base):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from certainty_adapter import restore
 from facts_v7_study import Head,setup,evaluate
 from adapter_study import features
 root=Path(root);study=root/'recovered/study';result=json.loads((study/'result.json').read_text());plan=json.loads(PLAN.read_text())
 if not result['qualified_for_test'] or {t['seed'] for t in result['trials']}!={42,17,73} or not all(t['transfer_passed'] for t in result['trials']):raise ValueError('Three-seed transfer gates not passed')
 for name,sha in plan['source_sha256'].items():assert digest((ROOT/name).read_bytes())==sha,name
 assert digest(REPLAY.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 output=root/'fresh-test-once';output.mkdir(exist_ok=False);started=time.monotonic();torch.set_num_threads(2)
 # Only after all gates and once-only marker exist are test rows loaded for inference.
 rows=json.loads(REPLAY.read_text())['splits']['test'];results=[];tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 for trial in result['trials']:
  seed=trial['seed'];folder=study/f'flat-narrow-{seed}';model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'flat-narrow');state=torch.load(folder/'best.pt',weights_only=True,map_location='cpu')
  head=Head(True);head.load_state_dict(state['head']);restore(model,state['adapters']);m=evaluate(head,features(model,tok,[r['text'] for r in rows],'cpu'),rows);threshold=trial['selected']['threshold']
  measured=score(rows,m['predictions'],threshold);fallback=sum(r['label']!=14 and label==14 and p>=threshold for r,(label,p) in zip(rows,m['predictions']))
  item={'seed':seed,'threshold':threshold,'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'semantic':m,'metrics':measured,'reference_texts_routed_to_unmeasured_legacy':fallback}
  results.append(item);(output/f'seed-{seed}.json').write_text(json.dumps(item,ensure_ascii=False,indent=2)+'\n');del model,head;gc.collect()
 proof={'study':'facts-v7-replay','scope':'Synthetic reference head and deterministic binding test only; OTHER does not exercise combined legacy extraction. Root-held, not natural speech or human-reviewed. No selection by test.',
 'test_texts':len(rows),'test_root_families':4,'counterfactual_states_per_text':4,'trials':results,'seconds':time.monotonic()-started,'real_cpu_inference':True,'human_reviewed':False,'physical_device_tested':False,'old_v5_fresh480_inference':False}
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'verification/facts-v7-test-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k!='trials'}));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--base',required=True);a=p.parse_args();run(a.root,a.base)

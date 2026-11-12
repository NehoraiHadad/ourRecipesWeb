"""Post-selection diagnosis on already-used validation, never fresh test."""
import json
from pathlib import Path
from corpus import ROOT,digest
from adapter_study import features,predictions
from certainty_adapter import install,restore
from certainty_position import build_head
from certainty_train import DATA


def run(folder):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 torch.set_num_threads(2);folder=Path(folder);target=folder/'native-evaluation-once/selection.json';assert target.exists()
 trial=folder/'recovered/study/adapter-42';checkpoint=trial/'best.pt';state=torch.load(checkpoint,map_location='cpu',weights_only=True)
 base=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run/model'
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();install(model);restore(model,state['adapters']);model.eval()
 head=build_head();head.load_state_dict(state['head']);head.eval();tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 rows=[r for r in json.loads((DATA/'language.json').read_text())['validation'] if r['label']=='completed_not_done'];texts=[r['text'] for r in rows]
 pred=predictions(head,texts,features(model,tok,texts,'cpu'));threshold=json.loads((trial/'result.json').read_text())['best']['threshold']
 proof={'scope':'Diagnostic known validation only, after selection; not new test or independent accuracy. No thresholds/weights changed.',
  'checkpoint_sha256':digest(checkpoint.read_bytes()),'source_sha256':digest((ROOT/'adapter_corrections.py').read_bytes()),'threshold':threshold,
  'cases':[{'text':t,'expected':'completed_not_done','prediction':pred[t][0],'confidence':pred[t][1]} for t in texts]}
 (ROOT/'verification/adapter-v6-corrections-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False));return proof


if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');a=p.parse_args();run(a.root)

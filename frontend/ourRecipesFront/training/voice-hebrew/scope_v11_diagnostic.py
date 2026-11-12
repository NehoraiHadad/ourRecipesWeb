"""Trace consumed calibration/transfer failures after fixed replay selection.
No retraining, policy adjustment or sealed-test inference.
"""
import json
from pathlib import Path
from corpus import ROOT,digest
from scope_v11_data import DATA
from scope_v9_guarded import route
from scope_v9_hierarchy import raw


def run():
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 root=ROOT/'runs/colab-scope-v11-replay/recovered/study';study=json.loads((root/'result.json').read_text());rows=json.loads(DATA.read_text())['splits']['calibration'];records=[];torch.set_num_threads(2)
 for t in study['trials']:
  parent=json.loads((root/f"parent-seed-{t['seed']}/result.json").read_text());item={'seed':t['seed'],'selected_step':t['parent_semantic_best_step'],'checkpoint_sha256':t['checkpoint_sha256'],'calibration_fallbacks':[{'id':r['id'],'text':r['text'],'gold_label':r['label'],'raw':v} for r,v in zip(rows,t['raw_cpu_calibration']) if r['label']!=14 and route(v,t['policy'])[0]=='legacy'],'old_false':t['native']['old_false_cases'],'diagnostic_alternatives':[]}
  for name,v in parent['variants'].items():
   item['diagnostic_alternatives'].append({'name':name,'selected_step':v['best']['step'],'qualified_by_original_noncomponent_gates':v['qualified'],'checks':v['checks'],'cal_effective':v['calibration']['metrics']['correct_effective'],'cal_corrections':v['calibration']['metrics']['correct_corrections'],'cal_false':v['calibration']['metrics']['false_proposals'],'old_effective':v['transfer']['effective']['correct_effective_updates'],'old_corrections':v['transfer']['corrections_correct'],'old_false':v['transfer']['old']['false_updates'],'guard_exact':v['transfer']['guard']['exact_proposals']})
  if item['old_false']:
   base=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run/model';checkpoint=root/f"seed-{t['seed']}/model.pt";assert digest(checkpoint.read_bytes())==t['checkpoint_sha256'];tok=AutoTokenizer.from_pretrained(base,local_files_only=True);model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();setup(model,'factor-wide');head=FactorHead();state=torch.load(checkpoint,weights_only=True,map_location='cpu');head.load_state_dict(state['head']);restore(model,state['adapters']);values=raw(model,tok,head,[c['utterance'] for c in item['old_false']])
   for c,v in zip(item['old_false'],values):c['actual_cpu_raw']=v;c['fixed_route']=route(v,t['policy'])
   del model,head,state
  records.append(item)
 proof={'scope':'Post-selection diagnosis on consumed calibration/transfer only; alternative selectors reported but cannot replace the fixed primary method retroactively. No weights, thresholds or tests changed.','trials':records,'fresh_test_inference':False,'human_reviewed':False,'physical_device_tested':False}
 (ROOT/'verification/scope-v11-replay-diagnostic-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False));return proof


if __name__=='__main__':run()

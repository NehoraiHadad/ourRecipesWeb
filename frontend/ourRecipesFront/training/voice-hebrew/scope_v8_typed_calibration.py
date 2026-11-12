"""Class-conditional selective calibration on frozen factor/product predictions.
Four actionable fact classes; off is allowed, so zero-error always-clarify must
still fail independent coverage gates. Raw NN confidences are never relabelled
as calibrated probabilities. No test access here.
"""
import json
from corpus import ROOT,digest
from facts_v7 import JOINT,score
from scope_v8_data import DATA
ACTIONABLE=tuple(i for i,f in enumerate(JOINT) if f[1]=='asserted' and f[2] in ('complete','incomplete'))
GRID=(None,.5,.7,.85,.95,.99)


def filtered(pred,thresholds):
 """Zero is a routing mask for abstention, not a new model confidence."""
 if len(thresholds)!=15:raise ValueError('15 class thresholds required')
 return [(i,p if thresholds[i] is not None and p>=thresholds[i] else 0.) for i,p in pred]


def calibrate(rows,pred):
 if len(rows)!=len(pred):raise ValueError('Row/prediction mismatch')
 thresholds=[.99]*15;details={}
 for label in ACTIONABLE:
  grid=[]
  for threshold in GRID:
   proposal=[(i,p if i==label and threshold is not None and p>=threshold else 0.) for i,p in pred]
   m=score(rows,proposal,.5);key=(m['false_proposals']==0,m['correct_effective']+m['correct_corrections'],m['true_proposals'],2. if threshold is None else threshold)
   grid.append({'threshold':threshold,'key':key,'metrics':{k:v for k,v in m.items() if k!='failures'}})
  choice=max(grid,key=lambda v:tuple(v['key']));thresholds[label]=choice['threshold'];details[str(label)]={'fact':JOINT[label],'choice':choice,'grid':grid}
 gated=filtered(pred,thresholds);m=score(rows,gated,.5);fallback=sum(r['label']!=14 and i==14 and p>=.5 for r,(i,p) in zip(rows,gated))
 return {'thresholds':thresholds,'action_classes':details,'metrics':m,'unmeasured_reference_fallback':fallback,
 'passed':m['false_proposals']==0 and m['effective_recall']>=.75 and m['correction_recall']>=.75 and fallback==0}


def run():
 rows=json.loads(DATA.read_text())['splits']['calibration'];folder=ROOT/'runs/colab-scope-v8-factor/recovered/study/adapted-factor-wide-42';trial=json.loads((folder/'result.json').read_text());result=calibrate(rows,trial['calibration']['predictions'])
 proof={'scope':'Exploratory calibration on same already-used calibration493, weights/dev-selected checkpoint unchanged; no transfer inference yet and no test. Requires real native old/guard validation and prospective17/73 before any test.',
 'model':'Adapted f053 factor-wide/product best2000, seed42','checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'selection':'Separate zero-false selective thresholds for4 actionable fact classes. Other classes retain.99. Same proposal/effective/correction metrics; no loosened qualification gates.',
 'calibration':result,'new_test_inference':False,'source_sha256':digest((ROOT/'scope_v8_typed_calibration.py').read_bytes())}
 (ROOT/'verification/scope-v8-typed-calibration-feasibility-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':result['passed'],'thresholds':result['thresholds'],'metrics':{k:v for k,v in result['metrics'].items() if k!='failures'}}));return proof

if __name__=='__main__':run()

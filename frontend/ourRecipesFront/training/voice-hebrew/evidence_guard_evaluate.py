"""Known consumed guard: actual cached f053 predictions, deterministic filter.
No neural simulation, no calibration, fresh-test access or app mutation.
"""
import json
from corpus import ROOT,load_data,digest
from certainty_train import BASE,compact
from reference_train import metrics
from evidence_guard import validate

def run():
 recs,allrows=load_data(ROOT/'runs/state-v13-preflight/shared');rows=[r for r in allrows if r['split']=='validation' and r.get('evaluation_kind')!='state'];base={c['id']:c['actual'] for c in json.loads((BASE/'validation-research-full.json').read_text())['cases']};after={};rejections=[]
 for row in rows:
  d=validate(recs[row['recipe_id']],row['utterance'],base[row['id']]);after[row['id']]=d['proposal']
  if d['rejected']:rejections.append({'id':row['id'],'text':row['utterance'],'rejected':d['rejected']})
 before=metrics(rows,recs,base);filtered=metrics(rows,recs,after)
 proof={'scope':'Deterministic lexical contradiction guard on already-used326, applied to saved actual T4 f053 proposals. Not a new neural model or independent test. Runtime ingredients/action.text/evidence only; action.report/gold/split/currentStep not used by guard. No remapping.',
 'before':compact(before),'after':compact(filtered),'rejections':rejections,'source_sha256':digest((ROOT/'evidence_guard.py').read_bytes()),'fresh_test_inference':False,'human_reviewed':False,'physical_device_tested':False}
 (ROOT/'verification/evidence-guard-results-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False,indent=2));return proof

if __name__=='__main__':run()

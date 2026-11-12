"""Separate validation stress probes: partial completion OUTSIDE current step.

Not training/selection data. Holds current-step semantics fixed while breaking
the odd/even completed-count shortcut present in the main synthetic fixtures.
"""
from copy import deepcopy
import datetime
import json
from pathlib import Path
from corpus import ROOT,digest,validate
from state_data import authored


def build():
    recs,rows=authored();recs={k:r for k,r in recs.items() if r['split']=='validation'}
    lookup={(r['recipe_id'],r['scenario']):r for r in rows};result=[]
    choices=['state-done-0/0-0','state-not_done-0/2-0','state-undo-0/0-0','state-done-0/ambiguous-0-0']
    for n,recipe in enumerate(recs.values()):
        for scenario in choices:
            row=deepcopy(lookup[recipe['id'],scenario]);state=row['state'];outside=[a['id'] for a in recipe['actions'] if a['step']!=state['currentStep']]
            old_current=set(state['completed'])-set(outside)
            state['completed']=[*state['completed'],outside[n%2]]
            state['remaining']=[a['id'] for a in recipe['actions'] if a['id'] not in state['completed']]
            assert set(state['completed'])-set(outside)==old_current
            row['id']+='-outside-partial';row['family']='validation:state12-invariance:'+scenario
            row['counterfactual_group']=None;result.append(row)
    validate(list(recs.values()),result);return recs,result


def freeze():
    recs,rows=build();data={'recipes':list(recs.values()),'rows':rows}
    p=ROOT/'verification/state-v12-invariance-fixtures-20261112.json';p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    proof={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'Separate validation robustness diagnostic, never used to select checkpoint/threshold/family; authored before observing V12 quality outputs',
        'cases':len(rows),'recipes':len(recs),'fixtures_sha256':digest(p.read_bytes()),'source_sha256':digest((ROOT/'state_invariance.py').read_bytes()),
        'held_fixed':'Current-step action states, utterance, previous report and expected interpretation',
        'changed':'Exactly one action outside the current step is completed instead of zero/two; breaks global parity shortcut',
        'new_test_inference':False,'quality_results_observed':False}
    (ROOT/'verification/state-v12-invariance-plan-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');return proof


if __name__=='__main__':print(json.dumps(freeze()))

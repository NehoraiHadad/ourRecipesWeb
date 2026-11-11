"""Recover the already-measured seed17 checkpoint by one fixed 750-step rerun.

No new test scoring, hyperparameter search, or primary model reselection.
"""
import argparse
import json
from pathlib import Path
import time
from combined_data import build
from corpus import ROOT,digest
from span_pilot import run as train


def run(output,steps=750,max_seconds=600):
    if steps!=750:raise ValueError('Reproduction is fixed at the original selected step750')
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    target=json.loads((ROOT/'verification/combined-reproduction-target-20261111.json').read_text())
    _,data,_=build(output/'comparison-data')
    manifest=json.loads((data/'manifest.json').read_text())
    if manifest['corpus_sha256']!=target['config']['corpus_sha256']:raise ValueError('Original training corpus changed')
    (output/'selection-frozen.json').write_text(json.dumps({'role':'Supplemental reproduction of original validation-selected seed17 step750; original primary seed42 remains unchanged','seed':17,'step':750},indent=2)+'\n')
    report=train(output,steps=750,max_seconds=min(420,max_seconds-30),device='cuda',model_choice='base',train_only=True,
        profile='context-joint-v3',eval_every=250,data_source=data,seed=17,checkpoint_objective='f0.5')
    config=json.loads((output/'run/run-config.json').read_text())
    measured=json.loads((output/'run/validation.json').read_text())['at_0_5']
    expected=target['expected_validation_proposals'];actual={c['id']:c['actual'] for c in measured['cases']}
    mismatches=[key for key in expected if actual.get(key)!=expected[key]]
    result={'role':'Supplemental artifact recovery after original four-trial study; not a new independent quality result',
        'original_primary_unchanged':True,'original_new_test_not_rescored':True,'seed':17,'requested_step':750,
        'selected_step':config['selected_step'],'validation_proposal_mismatches':len(mismatches),'mismatch_ids':mismatches,
        'validation_examples':len(expected),'original_report_sha256':target['original_report_sha256'],
        'training':report,'config':config,'target_sha256':digest((ROOT/'verification/combined-reproduction-target-20261111.json').read_bytes())}
    # This compatibility filename is recovered by the existing bounded driver.
    (output/'combined-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    if mismatches or config['selected_step']!=750:raise ValueError('Reproduction did not match the original validation checkpoint; do not substitute silently')
    print(json.dumps(result,indent=2),flush=True);return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=750);p.add_argument('--max-seconds',type=int,default=600);a=p.parse_args();run(a.output,a.steps,a.max_seconds)

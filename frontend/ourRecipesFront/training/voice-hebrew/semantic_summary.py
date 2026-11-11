"""Summarize a finished model comparison without scoring or choosing again."""
import argparse
from collections import defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from semantic_sweep import fbeta


def summarize(recovered):
    root=Path(recovered);result=deepcopy(json.loads((root/'semantic-report.json').read_text()))
    result['remote_status']=json.loads((root/'status.json').read_text()) if (root/'status.json').exists() else {'scope':'CPU mechanics smoke'}
    result['primary_test_is_synthetic']=True
    result['paired_test_deltas']={}
    tests={(r['arm'],r['seed']):r['metrics'] for r in result['new_test_once']}
    for arm in ['data_only','loss_only']:
        result['paired_test_deltas'][arm]=[{'seed':s,
            'f0_5_delta':fbeta(tests[arm,s])-fbeta(tests['control',s]),
            'precision_delta':(tests[arm,s]['update_precision'] or 0)-(tests['control',s]['update_precision'] or 0),
            'recall_delta':tests[arm,s]['update_recall']-tests['control',s]['update_recall'],
            'false_updates_delta':tests[arm,s]['false_updates']-tests['control',s]['false_updates']} for s in [42,17]]
    result['test_per_recipe']={}
    for r in result['new_test_once']:
        full=json.loads((root/'ablations'/f'{r["arm"]}-{r["seed"]}'/'run/new-test-once.json').read_text())
        # Resolve through the saved test rows instead of guessing ID boundaries.
        rows=[json.loads(line) for line in (root/'selected-data/test.jsonl').read_text().splitlines()]
        by_id={row['id']:row['recipe_id'] for row in rows};grouped=defaultdict(lambda:{'examples':0,'exact':0,'false_updates':0})
        for case in full['cases']:
            m=grouped[by_id[case['id']]];m['examples']+=1;m['exact']+=int(case['exact']);m['false_updates']+=case['false_updates']
        result['test_per_recipe'][f'{r["arm"]}-{r["seed"]}']=dict(grouped)
    winner=result['selected_arm'];selected=json.loads((root/'ablations'/f'{winner}-42'/'run/new-test-once.json').read_text())
    result['selected_failure_examples']=[c for c in selected['cases'] if c['false_updates']][:3]
    result['selected_other_failure_examples']=[c for c in selected['cases'] if not c['exact'] and not c['false_updates']][:3]
    result['training_seconds_sum']=sum(v['report']['training_seconds'] for v in result['variants'])
    result['gpu_peak_allocated_bytes']=max(v['report']['gpu_peak_allocated_bytes'] or 0 for v in result['variants'])
    model=root/'run/model/model.safetensors'
    if model.exists():
        with model.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
        result['retained_weights']={'bytes':model.stat().st_size,'sha256':sha,'seed':42,'arm':winner}
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('recovered');p.add_argument('output');a=p.parse_args()
    result=summarize(a.recovered);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selected_arm':result['selected_arm'],'paired_test_deltas':result['paired_test_deltas']},indent=2))

"""Prospective input proposal only: not wired to training, inference or the app.

Makes the recipe/state information available to each action query. The audit
proves distinguishability, never that an existing model understands this input.
"""
import argparse
from collections import defaultdict
import json
from pathlib import Path
from corpus import ROOT,MODEL_ID,MODEL_REVISION,digest,load_data,queries


def proposed_queries(recipe,row):
    actions=recipe['actions'];ids=[a['id'] for a in actions];state=row['state']
    if row['recipe_id']!=recipe['id'] or len(set(ids))!=len(ids):raise ValueError('Recipe identity/actions invalid')
    completed=state['completed'];remaining=state['remaining'];step=state['currentStep']
    if not isinstance(step,int) or isinstance(step,bool) or not 0<=step<=max(a['step'] for a in actions):raise ValueError('Current step invalid')
    if (len(completed)!=len(set(completed)) or len(remaining)!=len(set(remaining))
        or set(completed)&set(remaining) or set(completed)|set(remaining)!=set(ids)):raise ValueError('State partition invalid')
    # Canonical recipe order, independent of completed/remaining list order.
    lines=[f"{a['id']} | שלב {a['step']+1} | {a['text']} | "+('בוצע' if a['id'] in completed else 'נותר') for a in actions]
    context=f"שלב נוכחי: {step+1}\nפעולות המתכון והמצב:\n"+'\n'.join(lines)
    for q in queries(recipe,row,3):
        if q['task']=='action':q={**q,'context':q['context']+f"\nמזהה פעולה נבדקת: {q['action_id']}\n"+context}
        yield q


def audit(data,probe_file,output):
    from transformers import AutoTokenizer
    tok=AutoTokenizer.from_pretrained(MODEL_ID,revision=MODEL_REVISION,local_files_only=True)
    recs,rows=load_data(Path(data));probes=json.loads(Path(probe_file).read_text())
    def conflicts(rows,fn):
        groups=defaultdict(set)
        for row in rows:
            for q in fn(recs[row['recipe_id']],row):
                encoded=tok(q['context'],q['utterance'],truncation=False)['input_ids']
                groups[q['task'],tuple(encoded)].add(q['label'])
        return sum(len(v)>1 for v in groups.values())
    maximum=unknown=count=0
    for row in rows:
        for q in proposed_queries(recs[row['recipe_id']],row):
            ids=tok(q['context'],q['utterance'],truncation=False)['input_ids'];count+=1
            maximum=max(maximum,len(ids));unknown+=ids.count(tok.unk_token_id)
    result={'role':'Prospective state-input structural/tokenizer audit only; no model inference, training or quality score',
        'proposal_source_sha256':digest((ROOT/'state_input_probe.py').read_bytes()),'queries':count,'max_tokens':maximum,
        'unknown_tokens':unknown,'within_512_without_truncation':maximum<=512,'state_probes':len(probes),
        'legacy_conflicting_token_inputs':conflicts(probes,lambda r,x:queries(r,x,3)),
        'proposed_conflicting_token_inputs':conflicts(probes,proposed_queries),
        'proposed_main_dataset_conflicts':conflicts(rows,proposed_queries),'new_test_inference':False,
        'included_in_v11_training_or_selection':False,'physical_device_tested':False}
    Path(output).write_text(json.dumps(result,indent=2)+'\n');return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('data');p.add_argument('probes');p.add_argument('output');a=p.parse_args()
    print(json.dumps(audit(a.data,a.probes,a.output)))

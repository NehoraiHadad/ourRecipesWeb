"""Compare reproduced predictions to frozen predictions, without accuracy labels."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import time
from engine import compose
from span_pilot import encode,infer


def compare(original,reproduced,output):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    torch.set_num_threads(4);original=Path(original);reproduced=Path(reproduced)
    recipes={r['id']:r for r in json.loads((original/'selected-data/recipes.json').read_text())}
    rows=[json.loads(line) for line in (original/'selected-data/test.jsonl').read_text().splitlines()]
    # Expected accuracy labels are deliberately unavailable to the encoder and
    # comparison. Only previously frozen model outputs are compared.
    for row in rows:row['gold']={'intent':'clarify','changes':[]}
    expected=json.loads((original/'ablations/combined-17/run/new-test-once.json').read_text())
    expected={case['id']:case['actual'] for case in expected['cases']}
    cfg=json.loads((reproduced/'run-config.json').read_text())
    tok=AutoTokenizer.from_pretrained(reproduced/'model',local_files_only=True)
    model=AutoModelForTokenClassification.from_pretrained(reproduced/'model',local_files_only=True,attn_implementation='eager').eval()
    items=[x for row in rows for x in encode(tok,recipes[row['recipe_id']],row,cfg['span_profile'])]
    records=infer(model,tok,items,'cpu',time.monotonic()+180)
    grouped=defaultdict(list)
    for record in records:grouped[record['example_id']].append(record)
    mismatches=[]
    for row in rows:
        records=grouped[row['id']];actual=compose(records,.5)
        lookup={r['action_id']:r for r in records if r['task']=='action'}
        for change in actual['changes']:change['evidence']=lookup[change['actionId']]['evidence']
        if actual!=expected[row['id']]:mismatches.append(row['id'])
    proof={'role':'Frozen-output equivalence after fixed-seed artifact recovery; no accuracy labels, metric scoring, new model selection or tuning',
        'cases':len(rows),'proposal_mismatches':len(mismatches),'mismatch_ids':mismatches,
        'source':'Original GPU combined-seed17 predictions','target':'Reproduced checkpoint on native CPU'}
    Path(output).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));return proof


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('original');p.add_argument('reproduced');p.add_argument('output');a=p.parse_args();compare(a.original,a.reproduced,a.output)

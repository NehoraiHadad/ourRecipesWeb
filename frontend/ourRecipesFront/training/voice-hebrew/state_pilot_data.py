"""V13 train-only outside-step contrasts; V12 validation/test remain unchanged."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
from corpus import load_data,digest
from state_data import build as previous
from semantic_data import write


def build(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        old,audit=previous(Path(tmp)/'v12');recs,rows=load_data(old);extra=[]
        for row in rows:
            if row['split']!='train' or row.get('evaluation_kind')!='state':continue
            recipe=recs[row['recipe_id']];outside=[a['id'] for a in recipe['actions'] if a['step']!=row['state']['currentStep']]
            if set(outside)&set(row['state']['completed']):continue
            for n,aid in enumerate(outside):
                v=deepcopy(row);v['id']+=f'-partial-outside-{n}';v['state']['completed'].append(aid)
                v['state']['remaining']=[a['id'] for a in recipe['actions'] if a['id'] not in v['state']['completed']]
                extra.append(v)
        data=write(output/'shared',recs,rows+extra,'V13 train-only partial outside-state contrasts; unchanged V12 heldouts')
        for name in ('validation.jsonl','test.jsonl'):assert (old/name).read_bytes()==(data/name).read_bytes()
    proof={'study':'state-v13-pilot','prior_corpus_sha256':audit['corpus_sha256'],'added_training_rows':len(extra),
        'training_rows':sum(r['split']=='train' for r in rows+extra),'heldouts_unchanged_from_unscored_v12':True,
        'corpus_sha256':json.loads((data/'manifest.json').read_text())['corpus_sha256'],'human_reviewed':False,'new_test_inference':False}
    (output/'data-audit.json').write_text(json.dumps(proof,indent=2)+'\n');return data,proof

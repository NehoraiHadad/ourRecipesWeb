"""Prove original and scoped engines encode every record identically on CPU."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path


def run(folder):
    from transformers import AutoTokenizer
    import sparse_recipe_sft as old
    import adapter_scope_sft_v11 as new
    from sparse_recipe_data_v4 import messages
    root=Path(__file__).resolve().parent;old.messages=messages
    tokenizer=AutoTokenizer.from_pretrained(folder,local_files_only=True)
    data=json.loads((root/'verification/native-scope-data-v10-20261116.json').read_text())['splits']
    count=0
    for rows in data.values():
        for row in rows:
            a=old.encode(tokenizer,row,1024);b=new.encode(tokenizer,row,1024)
            assert a==b,row['id'];count+=1
    assert count==676
    original=(root/'sparse_recipe_sft.py').read_text();derived=(root/'adapter_scope_sft_v11.py').read_text()
    diff=''.join(difflib.unified_diff(original.splitlines(True),derived.splitlines(True),fromfile='original',tofile='scoped'))
    report={'records_compared':count,'all_encoded_inputs_labels_and_counts_identical':True,
        'scope':'CPU tokenizer and loss mask only. No model weights, PEFT injection or inference.',
        'engine_diff':diff,'derived_engine_sha256':hashlib.sha256(derived.encode()).hexdigest()}
    path=root/'verification/adapter-scope-preflight-v11-20261116.json'
    with path.open('x') as stream:stream.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'records':count,'identical':True}))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tokenizer',required=True);a=p.parse_args();run(a.tokenizer)

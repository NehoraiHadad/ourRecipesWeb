"""CPU tokenizer/collator audit; does not load or infer model weights."""
import argparse
import hashlib
import json
from pathlib import Path


def run(folder):
    import transformers
    from transformers import AutoTokenizer
    import sparse_recipe_sft as engine
    from sparse_recipe_data_v4 import messages
    root=Path(__file__).resolve().parent;folder=Path(folder)
    old_plan=json.loads((root/'verification/sparse-recipe-control-plan-v5-20261116.json').read_text())
    assert hashlib.sha256((folder/'tokenizer_config.json').read_bytes()).hexdigest()==old_plan['model']['small_file_sha256']['tokenizer_config.json']
    engine.messages=messages;tokenizer=AutoTokenizer.from_pretrained(folder,local_files_only=True)
    inputs={'control':'verification/sparse-recipe-control-data-v5-20261116.json','native':'verification/native-scope-data-v10-20261116.json'}
    order=json.loads((root/'verification/native-scope-reference-v10-20261116.json').read_text())['training_indices'];report={}
    for name,path in inputs.items():
        groups=json.loads((root/path).read_text())['splits'];stats={};train=None
        for group,rows in groups.items():
            encoded=[engine.encode(tokenizer,row,1024) for row in rows]
            assert max(r['prompt_tokens'] for r in encoded)+96<=1024
            assert all(e['input_ids'][-1]==tokenizer.eos_token_id and e['labels'][-1]==tokenizer.eos_token_id for e in encoded)
            stats[group]={'cases':len(rows),'max_total_tokens':max(len(r['input_ids']) for r in encoded),'max_prompt_tokens':max(r['prompt_tokens'] for r in encoded)}
            if group=='train':train=encoded
        batch=engine.collate(train[:2],tokenizer.pad_token_id,'cpu')
        assert (batch['labels'][batch['attention_mask']==0]==-100).all()
        stats['sampled640_training_tokens']=sum(len(train[i]['input_ids']) for i in order)
        stats['sampled640_target_tokens']=sum(train[i]['target_tokens'] for i in order)
        stats['padding_loss_masked']=True;report[name]=stats
    report['scope']='CPU tokenizer/collator only. Same640 array indices, not matched token/FLOP count. No weights or model inference.'
    report['local_transformers']=transformers.__version__
    (root/'verification/native-scope-preflight-v10-20261116.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tokenizer',required=True);a=p.parse_args();run(a.tokenizer)

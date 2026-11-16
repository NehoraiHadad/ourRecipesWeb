"""Tokenizer/data audit only. No model inference, training or held-set reads."""
import argparse
import collections
import hashlib
import json
from pathlib import Path

import sparse_recipe_sft as engine
from sparse_recipe_data_v4 import DATA, build, messages
from sparse_recipe_v3 import score


def audit(tokenizer_path):
    from transformers import AutoTokenizer
    engine.messages = messages
    tok = AutoTokenizer.from_pretrained(tokenizer_path, local_files_only=True, trust_remote_code=False)
    raw = DATA.read_bytes()
    assert raw == (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode()
    data = json.loads(raw)['splits']
    result = {'scope': 'Pre-result data/tokenizer audit only; no training or model inference',
              'master_data_sha256': hashlib.sha256(raw).hexdigest(), 'splits': {}}
    for split, rows in data.items():
        encoded = [engine.encode(tok, r, 1024) for r in rows]
        assert max(e['prompt_tokens'] for e in encoded) + 96 <= 1024
        result['splits'][split] = {'cases': len(rows), 'families': dict(collections.Counter(r['family'] for r in rows)),
             'max_prompt_tokens': max(e['prompt_tokens'] for e in encoded),
             'max_full_tokens': max(len(e['input_ids']) for e in encoded),
             'required_change_cases': sum(score(r, json.dumps(r['expected']))['requires_change'] for r in rows),
             'critical_no_facts': sum(r['critical_no_facts'] for r in rows)}
    result['cells'] = {cell: len([r for r in data['development'] if r['cell'] == cell]) for cell in sorted({r['cell'] for r in data['development']})}
    result['reference_utterance_overlap_note'] = 'Generic reference text may repeat across contexts; complete requests are disjoint. Seen template cells are diagnostic, not claims of fresh linguistic generalization.'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--tokenizer', required=True); parser.add_argument('--output', required=True)
    args = parser.parse_args(); result = audit(args.tokenizer)
    with Path(args.output).open('x') as stream: stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))

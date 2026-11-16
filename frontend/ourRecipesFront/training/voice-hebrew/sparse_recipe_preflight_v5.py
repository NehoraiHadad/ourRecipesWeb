"""Replay and language-probe tokenizer audit, no model inference."""
import argparse
import hashlib
import json
from pathlib import Path

import sparse_recipe_sft as engine
from sparse_recipe_data_v4 import messages
from sparse_recipe_data_v5 import build, DATA
from sparse_recipe_language_probe_v5 import build as language_probe, messages as language_messages


def audit(tokenizer_path):
    from transformers import AutoTokenizer
    raw = DATA.read_bytes(); assert raw == (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode()
    tok = AutoTokenizer.from_pretrained(tokenizer_path, local_files_only=True, trust_remote_code=False)
    result = {'data_sha256': hashlib.sha256(raw).hexdigest(), 'splits': {},
              'scope': 'Tokenizer, masking and length only; no inference or training'}
    groups = [(name, rows, messages) for name, rows in build()['splits'].items()]
    groups += [('language-' + lang, rows, lambda row, current=lang: language_messages(row, current)) for lang, rows in language_probe().items()]
    for name, rows, formatter in groups:
        engine.messages = formatter
        encoded = [engine.encode(tok, r, 1024) for r in rows]
        assert max(r['prompt_tokens'] for r in encoded) + 96 <= 1024
        result['splits'][name] = {'cases': len(rows), 'max_prompt_tokens': max(r['prompt_tokens'] for r in encoded),
                                'max_full_tokens': max(len(r['input_ids']) for r in encoded)}
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--tokenizer', required=True); p.add_argument('--output', required=True)
    a = p.parse_args(); result = audit(a.tokenizer)
    with Path(a.output).open('x') as stream: stream.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))

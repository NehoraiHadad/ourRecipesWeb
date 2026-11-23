"""Expand each scenario into one fluent take and two free-form fragments for local TTS."""
import json
from pathlib import Path

cases = json.loads(Path(__file__).with_name('cases.json').read_text())
prompts = []
for case in cases:
    parts = [case['fluent'], *case['parts']]
    for suffix, text in zip(('fluent', 'first', 'second'), parts, strict=True):
        prompts.append({'id': case['id'] + '-' + suffix, 'text': text})
print(json.dumps(prompts, ensure_ascii=False))

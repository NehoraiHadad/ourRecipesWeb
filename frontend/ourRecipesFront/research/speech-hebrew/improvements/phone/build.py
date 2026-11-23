"""Build an isolated static site. Only pinned public assets are downloaded."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent
BASE = ROOT.parent
REV = 'ee769a2a13b887f91572eec349458bfb0fe79e7a'
parser = argparse.ArgumentParser()
parser.add_argument('destination', type=Path)
out = parser.parse_args().destination
out.mkdir(parents=True, exist_ok=False)
(out/'models').mkdir()
(out/'hints').mkdir()
subprocess.run([sys.executable, str(BASE/'prepare-wasm.py')], check=True)
package = Path('/dev/shm/ourrecipes-speech-wasm/sherpaw-asr')
shutil.copytree(package/'dist',out/'pkg')
shutil.copy(package/'LICENSE',out/'SHERPAW-LICENSE.txt')
for name in ('index.html','probe.mjs'):
    shutil.copy(ROOT/name,out/name)
shutil.copy(BASE/'browser-worker.mjs',out/'worker.mjs')
assets = []
def add(path, data):
    (out/path).write_bytes(data)
    assets.append(dict(url='/'+path, size=len(data), sha256=hashlib.sha256(data).hexdigest()))

for path, spec in json.loads((BASE/'evidence/protocol.json').read_text())['models'].items():
    if not path.startswith('asr/sherpa-onnx/'):
        continue
    cached = Path('/tmp/voice-models')/path
    source = f'https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he/resolve/{REV}/{path[4:]}'
    data = cached.read_bytes() if cached.exists() else urllib.request.urlopen(source,timeout=120).read()
    assert hashlib.sha256(data).hexdigest() == spec['sha256']
    add('models/'+Path(path).name, data)
vocab = (ROOT/'bpe.vocab').read_bytes()
assert hashlib.sha256(vocab).hexdigest()=='9e6534080d66310a383c77dde1fa26e04c1c53162a7de734b559181a1d4a422e'
add('hints/bpe.vocab',vocab)
recipes=json.loads((BASE/'recipe-hints/recipes.json').read_text())
for recipe, nouns in recipes.items():
    forms=[prefix+noun for noun in nouns for prefix in ('','ה','ב','ל','מ','ו','וה')]
    add('hints/'+recipe+'.txt', ('\n'.join(forms)+'\n').encode())
(out/'manifest.json').write_text(json.dumps(dict(assets=assets,recipes=recipes),ensure_ascii=False))
(out/'NOTICE.txt').write_text('Hebrew Zipformer2 and derived BPE vocabulary: Yakov Kolani / ivrit.ai, CC BY 4.0. https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he/tree/'+REV+'\nhttps://creativecommons.org/licenses/by/4.0/\nRuntime: @sherpaw/asr 0.3.0, Apache-2.0; see SHERPAW-LICENSE.txt.\n')
print(out.resolve())

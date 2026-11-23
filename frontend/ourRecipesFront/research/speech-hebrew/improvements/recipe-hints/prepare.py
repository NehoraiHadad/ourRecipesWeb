"""Exact model tokenizer, static recipe lists and matched 16 kHz synthetic inputs."""
from pathlib import Path
import hashlib
import json
import subprocess
import urllib.request
import zipfile

import numpy as np
import sentencepiece as spm

ROOT = Path(__file__).resolve().parent
CACHE = Path('/dev/shm/hebrew-recipe-hints')
CACHE.mkdir(exist_ok=True)
revision = 'ee769a2a13b887f91572eec349458bfb0fe79e7a'
model = CACHE / 'bpe.model'
if not model.exists():
    model.write_bytes(urllib.request.urlopen(
        f'https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he/resolve/{revision}/bpe.model',
        timeout=60).read())
assert hashlib.sha256(model.read_bytes()).hexdigest()=='80e625d3648f13e67fdd804158feefaed432a89ed5107218a3af6ec7c4c129f0'
sp = spm.SentencePieceProcessor(model_file=str(model))
vocab = ''.join(f'{sp.id_to_piece(i)}\t{sp.get_score(i)}\n' for i in range(sp.get_piece_size()))
(CACHE/'bpe.vocab').write_text(vocab)
recipes = json.loads((ROOT/'recipes.json').read_text())
for recipe,nouns in recipes.items():
    # Same mechanical variant expansion for each recipe, including distractors.
    forms = [prefix+noun for noun in nouns for prefix in ('','ה','ב','ל','מ','ו','וה')]
    assert all(sp.unk_id() not in sp.encode(form) for form in forms)
    (CACHE/(recipe+'.txt')).write_text('\n'.join(forms)+'\n')
if __name__=='__main__' and (CACHE/'noa-c5.wav').exists():
    rows=[]
    cases=json.loads((ROOT/'cases.json').read_text())
    for voice in ['omer','liat','noa']:
        for case in cases:
            name=voice+'-'+case['id']
            wav=CACHE/(name+'.wav')
            pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(wav),'-ar','16000','-ac','1','-f','f32le','-'])
            (CACHE/(name+'.pcm')).write_bytes(pcm)
            rows.append(dict(**case,reference=case['text'],filename=name,voice=voice,
                pcm_sha256=hashlib.sha256(pcm).hexdigest(),wav_sha256=hashlib.sha256(wav.read_bytes()).hexdigest()))
    for name,pcm in [('silence',np.zeros(48000)),('noise',np.random.default_rng(42).uniform(-.01,.01,48000))]:
        raw=pcm.astype('<f4').tobytes();(CACHE/(name+'.pcm')).write_bytes(raw)
        rows.append(dict(id=name,filename=name,recipe=None,reference='',anchors=[],pcm_sha256=hashlib.sha256(raw).hexdigest()))
    (ROOT/'manifest.json').write_text(json.dumps({'records':rows},ensure_ascii=False,indent=2)+'\n')
    archive=ROOT/'sources.zip'
    if not archive.exists():
        with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED) as z:
            for r in rows:
                if 'voice' in r:
                    name=r['filename']+'.wav';z.write(CACHE/name,name)
            z.write(ROOT/'cases.json','cases.json')
            z.writestr('ATTRIBUTION.txt','Synthetic Hebrew audio, Omer and Liat (community Pocket Hebrew), Piper Noa, ReNikud by thewh1teagle. Weights CC BY 4.0. See ../styles/README.he.md for sources and pinned versions. No personal audio.')

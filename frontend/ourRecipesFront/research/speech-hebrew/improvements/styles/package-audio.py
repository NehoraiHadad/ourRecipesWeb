"""Preserve the exact synthetic source WAVs. Export listening examples from decoder PCM."""
import json
import wave
import zipfile
from pathlib import Path

import numpy as np
from prepare import ROOT, CACHE, RATE, VOICES

CREDITS = """Synthetic Hebrew kitchen prompts created for ourRecipesWeb.
Omer/Liat: thewh1teagle/pocket-tts-onnx (community Hebrew models, CC BY 4.0).
Noa: thewh1teagle/piper-he-noa (CC BY 4.0). Hebrew G2P: thewh1teagle/renikud.
Source URLs and pinned revisions: ../../evidence/model-sources.json in the repository.
References: https://huggingface.co/thewh1teagle/pocket-tts-onnx
https://huggingface.co/thewh1teagle/piper-he-noa
https://huggingface.co/thewh1teagle/renikud
License link: https://creativecommons.org/licenses/by/4.0/
Processing: scripted synthesis and digital effects. No personal recordings.
"""
prompts = json.loads((ROOT/'cases.json').read_text())
with zipfile.ZipFile(ROOT/'source-wavs.zip','x',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('ATTRIBUTION.txt', CREDITS)
    archive.write(ROOT/'cases.json','cases.json')
    for voice in VOICES:
        for prompt in prompts:
            name = f"{voice}-{prompt['id']}.wav"
            archive.write(CACHE/name,name)
examples = [
    ('omer','p01','plain'), ('liat','p02','rushed-high'), ('noa','p03','drawn-low'),
    ('omer','p04','phone'), ('liat','p05','fan-room'), ('noa','p06','metallic-robot'),
    ('omer','p10','theatrical-pause')]
out = ROOT/'samples'
out.mkdir(exist_ok=True)
for voice,prompt,style in examples:
    key=f'{voice}-{prompt}-{style}'
    suffix='' if style in ('metallic-robot','theatrical-pause') else '-raw'
    signal=np.fromfile(CACHE/(key+suffix+'.pcm'),dtype='<f4')
    with wave.open(str(out/(key+'.wav')),'wb') as audio:
        audio.setparams((1,2,RATE,0,'NONE','not compressed'))
        audio.writeframes((np.clip(signal,-1,1)*32767).round().astype('<i2').tobytes())

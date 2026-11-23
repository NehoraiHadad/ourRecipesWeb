"""Stage exact float32 WAVs for the actual file-input UI. Optional new synthesis archive."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile
from urllib.request import urlopen

import numpy as np
from scipy.io import wavfile

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('out', type=Path)
parser.add_argument('--voices', type=Path)
parser.add_argument('--corpus', type=Path, default=HERE, help='Directory containing new-cases.json and new-voices.zip')
parser.add_argument('--controls', nargs=4, type=Path, metavar=('DEV','HOLDOUT','CHALLENGE','FINAL'))
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=False)
rows = []


def add(name, pcm, reference, critical):
    pcm = np.asarray(pcm, dtype='<f4')
    wavfile.write(args.out / (name+'.wav'), 16000, pcm)
    rows.append(dict(name=name, reference=reference, critical=critical,
                     sha256=hashlib.sha256(pcm.tobytes()).hexdigest()))


if args.controls:
    groups = [['omer-stir-water','noa-garlic-varied','liat-oil-fluent'],
              ['liat-confirmed-clean'], ['noa-wet-clean'], ['noa-stir-late-water']]
    for directory, names in zip(args.controls, groups, strict=True):
        manifest = json.loads((directory / 'manifest.json').read_text())['records']
        for name in names:
            item = next(r for r in manifest if r['filename']==name)
            pcm = np.fromfile(directory / (name+'.pcm'), dtype='<f4')
            add(name, pcm, item['reference'], item['critical'])
            assert rows[-1]['sha256'] == item['pcm_sha256']
else:
    cases = json.loads((args.corpus / 'new-cases.json').read_text())
    source = args.corpus / 'new-voices.zip'
    if args.voices:
        with ZipFile(source, 'x') as archive, ZipFile(HERE.parent/'free-speech/source-flac.zip') as old:
            archive.writestr('ATTRIBUTION.txt',old.read('ATTRIBUTION.txt'))
            for case in cases:
                for voice in ('omer','liat','noa'):
                    stem = voice+'-'+case['id']
                    flac = subprocess.check_output(['ffmpeg','-v','error','-i',str(args.voices/(stem+'.wav')),
                                                    '-c:a','flac','-f','flac','pipe:1'])
                    archive.writestr(stem+'.flac',flac)

    def decode(data):
        raw = subprocess.check_output(['ffmpeg','-v','error','-i','pipe:0','-ac','1','-ar','16000',
                                       '-f','f32le','pipe:1'],input=data)
        return np.frombuffer(raw, dtype='<f4').astype('float64')

    url = ('https://raw.githubusercontent.com/karolpiczak/ESC-50/'
           '33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6/audio/4-168868-A-17.wav')
    with urlopen(url,timeout=60) as response:
        data = response.read()
    assert hashlib.sha256(data).hexdigest()=='e9d0e25a0565a8a9ebe5e26bf2c0dd65bded68eda8268cf24d7cfeb417c7c3e4'
    water = decode(data)
    with ZipFile(source) as archive:
        for case in cases:
            for voice in ('omer','liat','noa'):
                stem=voice+'-'+case['id']
                speech=decode(archive.read(stem+'.flac'))
                offset=int(hashlib.sha256(stem.encode()).hexdigest()[:8],16)%len(water)
                noise=np.resize(np.roll(water,-offset),len(speech))
                mixed=speech+noise*np.sqrt(np.mean(speech**2)/(10*np.mean(noise**2)))
                mixed*=min(1,.98/np.max(np.abs(mixed)))
                for kind,audio in [('clean',speech),('water',mixed)]:
                    add(stem+'-'+kind,audio,case['text'],case['critical'])
assert len(rows)==(6 if args.controls else len(cases)*6)
(args.out/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False))

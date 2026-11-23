"""Mix the first dev recording of each selected phrase with recorded pouring water."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
CACHE = Path('/dev/shm/kitchen-phone-dev-he')
URL = ('https://raw.githubusercontent.com/karolpiczak/ESC-50/'
       '33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6/audio/1-118559-A-17.wav')
SHA = '556d465ef6d44075c1c6f881202f001e088c20415e600be9a83714aa5d86ea07'
background = CACHE / 'pouring.wav'
if not background.exists():
    with urllib.request.urlopen(URL, timeout=60) as response:
        background.write_bytes(response.read())
assert hashlib.sha256(background.read_bytes()).hexdigest() == SHA


def samples(path):
    raw = subprocess.check_output(['ffmpeg', '-loglevel', 'error', '-i', str(path),
                                   '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'])
    return np.frombuffer(raw, dtype='<f4').astype('float64')


def rms(signal):
    return np.sqrt(np.mean(signal ** 2))


water = samples(background)
fixtures = json.loads((ROOT / 'fixtures.json').read_text())['records']
records = []
for source in ('1599', '1577', '1602', '1620'):
    item = next(r for r in fixtures if r['source_id'] == source)
    speech = samples(CACHE / item['file'])
    repeated = np.resize(water, len(speech))
    for snr in (10, 0):
        mixed = speech + repeated * rms(speech) / (rms(repeated) * 10 ** (snr / 20))
        mixed *= min(1, .98 / np.max(np.abs(mixed)))
        name = f"water-{snr}dB-{item['file']}"
        wavfile.write(CACHE / name, 16000, mixed.astype('float32'))
        records.append(dict(sourceFile=item['file'], file=name, snrDb=snr,
                            sha256=hashlib.sha256((CACHE / name).read_bytes()).hexdigest()))
(CACHE / 'water.json').write_text(json.dumps(records))

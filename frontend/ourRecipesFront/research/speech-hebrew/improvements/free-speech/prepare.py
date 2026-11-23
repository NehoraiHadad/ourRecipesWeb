"""Prepare clean, disfluent, and noisy paired inputs from lossless local TTS takes."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
from zipfile import ZipFile

import numpy as np

HERE = Path(__file__).resolve().parent
DEST = Path(sys.argv[1])
DEST.mkdir(parents=True, exist_ok=False)
SOURCE = HERE / 'source-flac.zip'
voices = ('omer', 'liat', 'noa')
cases = json.loads((HERE / 'cases.json').read_text())
rate = 16000


def pcm(encoded, speed=1):
    command = ['ffmpeg', '-v', 'error', '-i', 'pipe:0']
    if speed != 1:
        command += ['-af', f'atempo={speed}']
    data = subprocess.check_output(command + ['-ac', '1', '-ar', str(rate),
                                             '-f', 'f32le', 'pipe:1'], input=encoded)
    return np.frombuffer(data, dtype='<f4')


def assemble(first, second, gap_ms):
    return np.concatenate([first, np.zeros(rate * gap_ms // 1000, dtype='<f4'), second])


def rms(data):
    return np.sqrt(np.mean(data.astype(np.float64) ** 2))


noise_url = ('https://raw.githubusercontent.com/karolpiczak/ESC-50/'
             '33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6/audio/1-118559-A-17.wav')
with urllib.request.urlopen(noise_url, timeout=90) as response:
    noise_bytes = response.read()
assert hashlib.sha256(noise_bytes).hexdigest() == '556d465ef6d44075c1c6f881202f001e088c20415e600be9a83714aa5d86ea07'
noise = pcm(noise_bytes)
records = []
with ZipFile(SOURCE) as archive:
    for i, case in enumerate(cases):
        for j, voice in enumerate(voices):
            name = voice + '-' + case['id']
            fluent, first, second = [archive.read(name + '-' + part + '.flac')
                                     for part in ('fluent', 'first', 'second')]
            level = (i + j) % 3
            gap, first_speed, second_speed = [(420, 1.18, .95), (790, .94, 1.24),
                                              (1250, 1.12, 1.22)][level]
            steady = assemble(pcm(first), pcm(second), 100)
            varied = assemble(pcm(first, first_speed), pcm(second, second_speed), gap)
            offset = ((i * 3 + j) * 4919) % len(noise)
            background = np.resize(np.roll(noise, -offset), len(varied))
            mixed = varied + background * (rms(varied) / rms(background) / np.sqrt(10))
            mixed *= min(1, .98 / np.max(np.abs(mixed)))
            for style, data in [('fluent', pcm(fluent)), ('steady', steady),
                                ('varied', varied), ('water', mixed)]:
                filename = name + '-' + style
                raw = data.astype('<f4').tobytes()
                assert np.all(np.isfinite(data)) and rms(data) > 0
                (DEST / (filename + '.pcm')).write_bytes(raw)
                varied_delivery = style in ('varied', 'water')
                row = dict(filename=filename, case=case['id'], voice=voice, style=style,
                           reference=case['fluent'] if style=='fluent' else ' '.join(case['parts']),
                           critical=case['final'] if style=='fluent' else case['critical'],
                           final=case['final'], seconds=len(data)/rate,
                           pcm_sha256=hashlib.sha256(raw).hexdigest(),
                           speeds=[first_speed, second_speed] if varied_delivery else [1],
                           insertedGapMs=gap if varied_delivery else 100 if style=='steady' else 0)
                records.append(row)

# Reuse the exact short hints from the preceding pasta experiment.
heads = ['רוטב', 'שמן', 'פלפל']
hints = [prefix + head for head in heads for prefix in ('','ה','ב','ל','מ','ו','וה')]
(DEST / 'salad.txt').write_text('\n'.join(hints)+'\n')
shutil.copyfile(HERE.parent / 'phone/bpe.vocab', DEST / 'bpe.vocab')
assert len(records) == 96
(DEST / 'manifest.json').write_text(json.dumps(dict(records=records), ensure_ascii=False, indent=2)+'\n')

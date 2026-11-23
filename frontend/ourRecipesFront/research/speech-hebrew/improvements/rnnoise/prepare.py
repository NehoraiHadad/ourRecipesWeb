"""Stage isolated, public research inputs and browser runtime in a local temp directory."""
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

import numpy as np

HERE = Path(__file__).resolve().parent
PROBE, DEST = map(Path, sys.argv[1:3])
confirm = sys.argv[3:] == ['--confirm']
assert confirm or len(sys.argv) == 3
HUMAN = Path('/dev/shm/kitchen-phone-dev-he')
DEST.mkdir(parents=True, exist_ok=False)
for name in ('pkg', 'models', 'worker.mjs'):
    (DEST / name).symlink_to((PROBE / name).resolve())
(DEST / 'index.html').write_text('<title>Local ASR trial</title>')
shutil.copyfile(HERE / 'filter.mjs', DEST / 'filter.mjs')


def download(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def digest(data):
    return hashlib.sha256(data).hexdigest()


archive = download('https://registry.npmjs.org/@jitsi/rnnoise-wasm/-/rnnoise-wasm-0.2.1.tgz')
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    glue = tar.extractfile('package/dist/rnnoise-sync.js').read()
assert digest(glue) == '05a553f523d59502d133a6d05dbf1878137c9e7bcff06edf5561f7001b62f95f'
(DEST / 'rnnoise.js').write_bytes(glue)


def samples(data):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-ar', '16000',
                                   '-ac', '1', '-f', 'f32le', 'pipe:1'], input=data)
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


base = 'https://raw.githubusercontent.com/karolpiczak/ESC-50/33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6/audio/'
noises = {}
noise_sources = [
    ('human', '1-118559-A-17', '556d465ef6d44075c1c6f881202f001e088c20415e600be9a83714aa5d86ea07'),
    ('tts', '4-168868-A-17', 'e9d0e25a0565a8a9ebe5e26bf2c0dd65bded68eda8268cf24d7cfeb417c7c3e4')
]
if confirm:
    noise_sources = [('appliance', '2-51173-A-35', '7eccffff137ad586328f05daa5cb3147bf665ebfe9a7b66c88feab499f995a10')]
for group, name, sha in noise_sources:
    noise = download(base + name + '.wav')
    assert digest(noise) == sha
    noises[group] = samples(noise)

rows = []
phrases = {'1577': ['לא היה נראה', 'לא היה הוגן'], '1599': ['לא השתנתה'],
           '1654': ['לא יודע', 'או לא'], '1602': ['בשמן זית'], '1620': ['סוכר', 'סוכר קוקוס']}


def stage(group, name, reference, anchors, speech):
    water = np.resize(noises[group], len(speech))
    ratio = np.sqrt(np.mean(speech ** 2) / np.mean(water ** 2))
    for condition in (('clean', '5') if confirm else ('clean', '10', '0')):
        mixed = speech.copy()
        if condition != 'clean':
            mixed += water * ratio * 10 ** (-int(condition) / 20)
            mixed *= min(1, .98 / np.max(np.abs(mixed)))
        pcm = mixed.astype('<f4').tobytes()
        file = f'{name}-{condition}.pcm'
        (DEST / file).write_bytes(pcm)
        rows.append(dict(group=group, clip=name, reference=reference, anchors=anchors,
                         condition=condition, file=file, sha256=digest(pcm)))


if confirm:
    fresh = HERE.parent / 'fresh/manifest.json'
    for row in json.loads(fresh.read_text())['records']:
        if row['group'] != 'food-word':
            continue
        data = (Path('/dev/shm/ourrecipes-fresh-he') / (row['filename'] + '.pcm')).read_bytes()
        assert digest(data) == row['pcm_sha256']
        stage('appliance', Path(row['filename']).stem, row['reference'], row['matched'],
              np.frombuffer(data, dtype='<f4').astype(np.float64))
    assert len(rows) == 24
else:
    for row in json.loads((HERE.parent / 'phone/human/fixtures.json').read_text())['records']:
        data = (HUMAN / row['file']).read_bytes()
        assert digest(data) == row['sha256']
        stage('human', Path(row['file']).stem, row['reference'], phrases[row['source_id']], samples(data))
    cases = json.loads((HERE.parent / 'styles/cases.json').read_text())
    with zipfile.ZipFile(HERE.parent / 'styles/source-wavs.zip') as audio:
        for i, case in enumerate(cases):
            name = ('omer', 'liat', 'noa')[i % 3] + '-' + case['id']
            stage('tts', name, case['text'], case['anchors'], samples(audio.read(name + '.wav')))
    assert len(rows) == 75
(DEST / 'fixtures.json').write_text(json.dumps(rows, ensure_ascii=False))

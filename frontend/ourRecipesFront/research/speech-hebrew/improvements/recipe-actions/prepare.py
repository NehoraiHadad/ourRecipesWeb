"""Stage immutable PCM pairs and two local hotword lists for the shared ASR runner."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request
from zipfile import ZipFile

import numpy as np

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('out', type=Path)
parser.add_argument('--previous-inputs', type=Path, required=True)
variant = parser.add_mutually_exclusive_group()
variant.add_argument('--negated', action='store_true')
variant.add_argument('--weighted', action='store_true')
group = parser.add_mutually_exclusive_group()
group.add_argument('--holdout', action='store_true')
group.add_argument('--control', action='store_true')
group.add_argument('--challenge', action='store_true')
group.add_argument('--final-check', action='store_true')
args = parser.parse_args()
out = args.out
out.mkdir(parents=True, exist_ok=False)
baseline = (args.previous_inputs / 'salad.txt').read_bytes()
expected = ''.join(prefix + noun + '\n' for noun in ('רוטב', 'שמן', 'פלפל')
                   for prefix in ('', 'ה', 'ב', 'ל', 'מ', 'ו', 'וה')).encode()
assert baseline == expected
(out / 'salad.txt').write_bytes(baseline)
verbs = json.loads((HERE / 'hints.json').read_text())
fixture = (HERE.parents[3] / 'tests/unit/lib/recipes/parser.test.ts').read_text()
pasta = fixture.split('const PASTA_RECIPE = `')[1].split('`;')[0].split('הוראות הכנה:')[1]
assert all(verb in pasta for verb in verbs)
extra = ''.join(prefix + verb + '\n' for verb in verbs.values() for prefix in ('', 'ו'))
if args.negated or args.weighted:
    weight = ' :3.0' if args.weighted else ''
    extra += ''.join(f'{prefix} {verb}{weight}\n' for verb in verbs.values() for prefix in ('לא', 'עוד לא'))
(out / 'cookies.txt').write_bytes(baseline + extra.encode())
shutil.copyfile(HERE.parent / 'phone/bpe.vocab', out / 'bpe.vocab')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def decode(data):
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-ac', '1',
                                   '-ar', '16000', '-f', 'f32le', '-'], input=data)
    return np.frombuffer(pcm, dtype='<f4').astype(np.float64)


def rms(data):
    return np.sqrt(np.mean(data ** 2))


if args.holdout or args.challenge or args.final_check or args.control:
    url = ('https://raw.githubusercontent.com/karolpiczak/ESC-50/'
           '33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6/audio/4-168868-A-17.wav')
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    assert sha(data) == 'e9d0e25a0565a8a9ebe5e26bf2c0dd65bded68eda8268cf24d7cfeb417c7c3e4'
    water = decode(data)
    records = []
    if args.control:
        sources = json.loads((HERE.parent / 'phone/human/fixtures.json').read_text())['records']
        items = []
        for src in sources:
            wav = (Path('/dev/shm/kitchen-phone-dev-he') / src['file']).read_bytes()
            assert sha(wav) == src['sha256']
            items.append((Path(src['file']).stem, src['reference'], 'human', decode(wav)))
        items += [('water-only', '', 'background', water),
                  ('silence', '', 'background', np.zeros(4 * 16000))]
        for name, reference, style, samples in items:
            raw = samples.astype('<f4').tobytes()
            (out / (name + '.pcm')).write_bytes(raw)
            records.append(dict(filename=name, reference=reference, style=style,
                                critical=[], pcm_sha256=sha(raw)))
        assert len(records) == 15
    else:
        corpus = 'final-check' if args.final_check else 'challenge' if args.challenge else 'holdout'
        with ZipFile(HERE / f'{corpus}-flac.zip') as archive:
            for case in json.loads((HERE / f'{corpus}.json').read_text()):
                for voice in ('omer', 'liat', 'noa'):
                    stem = voice + '-' + case['id']
                    speech = decode(archive.read(stem + '.flac'))
                    offset = int(sha(stem.encode())[:8], 16) % len(water)
                    noise = np.resize(np.roll(water, -offset), len(speech))
                    mixed = speech + noise * (rms(speech) / rms(noise) / np.sqrt(10))
                    mixed *= min(1, .98 / np.max(np.abs(mixed)))
                    for style, samples in [('clean', speech), ('water', mixed)]:
                        raw = samples.astype('<f4').tobytes()
                        filename = stem + '-' + style
                        (out / (filename + '.pcm')).write_bytes(raw)
                        records.append(dict(filename=filename, case=case['id'], voice=voice, style=style,
                                            reference=case['text'], critical=case['critical'], pcm_sha256=sha(raw)))
        assert len(records) == (36 if args.final_check else 48 if args.challenge else 72)
else:
    records = json.loads((HERE.parent / 'free-speech/manifest.json').read_text())['records']
    for row in records:
        src = args.previous_inputs / (row['filename'] + '.pcm')
        assert sha(src.read_bytes()) == row['pcm_sha256']
        (out / src.name).symlink_to(src.resolve())
(out / 'manifest.json').write_text(json.dumps(dict(records=records), ensure_ascii=False, indent=2)+'\n')

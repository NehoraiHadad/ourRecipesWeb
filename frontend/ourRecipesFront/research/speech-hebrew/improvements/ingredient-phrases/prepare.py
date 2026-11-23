"""Compare ingredient heads to compound names from the project's pasta recipe fixture."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile
import sys

HERE = Path(__file__).resolve().parent
hybrid = sys.argv[-1] == '--combined'
args = sys.argv[1:-1] if hybrid else sys.argv[1:]
corrections = args[0] == '--corrections'
if corrections:
    OUT = Path(args[1])
else:
    TRIAL, CONFIRM, OUT = map(Path, args)
OUT.mkdir(parents=True, exist_ok=False)
phrases = ['רוטב עגבניות', 'שמן זית', 'פלפל שחור']
fixture = (HERE.parents[3] / 'tests/unit/lib/recipes/parser.test.ts').read_text()
pasta = fixture.split('const PASTA_RECIPE = `')[1].split('`;')[0].split('הוראות הכנה:')[0]
assert all(name in pasta for name in phrases)
# Historical runner has two fixture slots called salad and cookies.
for name, terms in [('salad', [p.split()[0] for p in phrases]), ('cookies', phrases)]:
    if name == 'cookies' and hybrid:
        terms = [p.split()[0] for p in phrases] + phrases
    content = [prefix + term for term in terms for prefix in ('','ה','ב','ל','מ','ו','וה')]
    (OUT / (name+'.txt')).write_text('\n'.join(content)+'\n')
shutil.copyfile(HERE.parent / 'phone/bpe.vocab', OUT / 'bpe.vocab')
records = []
if corrections:
    with zipfile.ZipFile(HERE / 'corrections-wav.zip') as wavs:
        for case in json.loads((HERE / 'corrections.json').read_text()):
            for voice in ('omer', 'liat', 'noa'):
                stem = voice + '-' + case['id']
                audio = wavs.read(stem + '.wav')
                pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-ac', '1',
                                               '-ar', '16000', '-f', 'f32le', 'pipe:1'], input=audio)
                (OUT / (stem + '.pcm')).write_bytes(pcm)
                records.append(dict(filename=stem, reference=case['text'], anchors=case['anchors'],
                                    pcm_sha256=hashlib.sha256(pcm).hexdigest()))
    assert len(records) == 18
else:
    reference_ids = {'1602','1620'}
    human = json.loads((HERE.parent / 'phone/human/fixtures.json').read_text())['records']
    human_clips = {Path(r['file']).stem for r in human if r['source_id'] in reference_ids}
    tts_cases = {'p01','p02','p03','p04','p05','p10'}
    for directory in [TRIAL, CONFIRM]:
        for r in json.loads((directory / 'fixtures.json').read_text()):
            if r['group'] == 'human' and r['clip'] not in human_clips:
                continue
            if r['group'] == 'tts' and r['clip'].split('-')[1] not in tts_cases:
                continue
            src = directory / r['file']
            assert hashlib.sha256(src.read_bytes()).hexdigest() == r['sha256']
            (OUT / src.name).symlink_to(src.resolve())
            records.append(dict(**r, filename=src.stem, pcm_sha256=r['sha256']))
    assert len(records) == 60
(OUT / 'manifest.json').write_text(json.dumps(dict(records=records),ensure_ascii=False))

"""Freeze all 36 local synthetic inputs without lossy transcoding."""
import json
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

here = Path(__file__).resolve().parent
source = Path(sys.argv[1])
corpus = sys.argv[2] if len(sys.argv)>2 else 'holdout'
assert corpus in ('holdout','challenge','final-check')
takes = {}
for case in json.loads((here / f'{corpus}.json').read_text()):
    for voice in ('omer', 'liat', 'noa'):
        stem = voice + '-' + case['id']
        takes[stem + '.flac'] = subprocess.check_output([
            'ffmpeg', '-v', 'error', '-i', str(source / (stem + '.wav')),
            '-c:a', 'flac', '-f', 'flac', 'pipe:1'])
with ZipFile(here.parent / 'free-speech/source-flac.zip') as old:
    attribution = old.read('ATTRIBUTION.txt')
with ZipFile(here / f'{corpus}-flac.zip', 'x') as archive:
    archive.writestr('ATTRIBUTION.txt', attribution)
    for name, data in takes.items():
        archive.writestr(name, data)

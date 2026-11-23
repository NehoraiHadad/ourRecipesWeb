"""Retain each synthetic take losslessly for repeatable ASR evaluation."""
import json
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
source = Path(sys.argv[1])
cases = json.loads((HERE / 'cases.json').read_text())
with ZipFile(HERE.parent / 'styles/source-wavs.zip') as old:
    attribution = old.read('ATTRIBUTION.txt').decode().replace('scripted synthesis and digital effects',
                                                                'local synthesis; lossless FLAC encoding')
files = {}
for case in cases:
    for voice in ('omer', 'liat', 'noa'):
        for part in ('fluent', 'first', 'second'):
            stem = '-'.join((voice, case['id'], part))
            files[stem + '.flac'] = subprocess.check_output([
                'ffmpeg', '-v', 'error', '-i', str(source / (stem + '.wav')),
                '-c:a', 'flac', '-f', 'flac', 'pipe:1'])
with ZipFile(HERE / 'source-flac.zip','x') as archive:
    archive.writestr('ATTRIBUTION.txt', attribution)
    for name, data in files.items():
        archive.writestr(name, data)

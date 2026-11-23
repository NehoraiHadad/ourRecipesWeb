"""Download the Hebrew FLEURS dev recordings selected for this ASR check."""
import csv
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
CACHE = Path('/dev/shm/kitchen-phone-dev-he')
REV = '70bb2e84b976b7e960aa89f1c648e09c59f894dd'
BASE = f'https://huggingface.co/datasets/google/fleurs/resolve/{REV}/data/he_il/'
# Food and negation prompts selected from the reference text before inference.
SOURCE_IDS = {'1602', '1620', '1577', '1654', '1599'}

CACHE.mkdir(exist_ok=True)
with urllib.request.urlopen(BASE + 'dev.tsv', timeout=60) as response:
    tsv = response.read().decode()
rows = []
for source, name, _, text, _, samples, gender in csv.reader(
    io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE
):
    if source in SOURCE_IDS:
        rows.append(dict(source_id=source, file=name, reference=text,
                         gender=gender, seconds=int(samples) / 16000))
assert len(rows) == 13
path = ROOT / 'fixtures.json'
expected = json.loads(path.read_text()) if path.exists() else None
known = {row['file']: row['sha256'] for row in expected['records']} if expected else {}
need = set()
for row in rows:
    cached = CACHE / row['file']
    if not cached.is_file() or hashlib.sha256(cached.read_bytes()).hexdigest() != known.get(row['file']):
        need.add(row['file'])
if need:
    with urllib.request.urlopen(BASE + 'audio/dev.tar.gz', timeout=120) as response:
        with tarfile.open(fileobj=response, mode='r|gz') as archive:
            for member in archive:
                name = Path(member.name).name
                if member.isfile() and name in need:
                    (CACHE / name).write_bytes(archive.extractfile(member).read())
                    need.remove(name)
                    if not need:
                        break
assert not need
for row in rows:
    row['sha256'] = hashlib.sha256((CACHE / row['file']).read_bytes()).hexdigest()
manifest = dict(dataset='Google FLEURS, he_il, dev, CC BY 4.0',
                revision=REV, source=BASE, records=rows)
if expected:
    assert expected == manifest
else:
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')

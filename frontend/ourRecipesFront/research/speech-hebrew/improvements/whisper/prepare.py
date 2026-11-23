import hashlib
import json
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parent
meta = json.loads((root / 'source.json').read_text())
cache = Path('/dev/shm/ourrecipes-whisper-tiny')
cache.mkdir(exist_ok=True)
for item in meta['files']:
    name = item['rfilename']
    path = cache / name
    if path.exists():
        data = path.read_bytes()
    else:
        url = f"https://huggingface.co/{meta['repo']}/resolve/{meta['revision']}/{name}"
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
    assert len(data) == item['size']
    if 'lfs' in item:
        assert hashlib.sha256(data).hexdigest() == item['lfs']['sha256']
    else:
        header = f'blob {len(data)}\0'.encode()
        assert hashlib.sha1(header + data).hexdigest() == item['blobId']
    if not path.exists():
        path.write_bytes(data)
    print(name, len(data), flush=True)

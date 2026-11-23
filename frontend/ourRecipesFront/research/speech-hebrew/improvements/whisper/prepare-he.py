"""Fetch the pinned Hebrew export and browser-only Transformers.js dist; no npm install."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

root = Path(__file__).resolve().parent
cache = Path('/dev/shm/ourrecipes-whisper-he')
cache.mkdir(exist_ok=True)
js = json.loads((root/'js-source.json').read_text())
tar = urllib.request.urlopen(js['tarball'],timeout=120).read()
assert 'sha512-'+base64.b64encode(hashlib.sha512(tar).digest()).decode()==js['integrity']
with tarfile.open(fileobj=io.BytesIO(tar)) as archive:
    for member in archive:
        filename=Path(member.name)
        if member.isfile() and filename.parent.as_posix()=='package/dist' and not filename.name.endswith('.map'):
            target=cache/'dist'/filename.name
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())
meta = json.loads((root/'he-source.json').read_text())
for item in meta['files']:
    name=item['rfilename']
    path=cache/'model'/('onnx' if name.endswith('.onnx') else '')/name
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists():
        data=path.read_bytes()
    else:
        url=f"https://huggingface.co/{meta['repo']}/resolve/{meta['revision']}/{name}"
        data=urllib.request.urlopen(url,timeout=120).read()
    assert len(data)==item['size']
    if 'lfs' in item:
        assert hashlib.sha256(data).hexdigest()==item['lfs']['sha256']
    else:
        assert hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()==item['blobId']
    if not path.exists():
        path.write_bytes(data)
    print(name,len(data),flush=True)

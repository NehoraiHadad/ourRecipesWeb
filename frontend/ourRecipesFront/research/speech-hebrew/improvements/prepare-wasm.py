"""Pinned, integrity-checked research runtime; no npm/project dependency mutation."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
META = json.loads((ROOT / 'evidence/wasm-source.json').read_text())
DEST = Path('/dev/shm/ourrecipes-speech-wasm/sherpaw-asr')


def valid(name, info):
    file = DEST / name
    return (file.is_file() and file.stat().st_size == info['bytes']
            and hashlib.sha256(file.read_bytes()).hexdigest() == info['sha256'])


if not all(valid(name, info) for name, info in META['files'].items()):
    raw = urllib.request.urlopen(META['dist']['tarball'], timeout=60).read()
    assert hashlib.sha256(raw).hexdigest() == META['tarball_sha256']
    assert 'sha512-' + base64.b64encode(hashlib.sha512(raw).digest()).decode() == META['dist']['integrity']
    # Read only explicitly pinned regular files; never tar.extractall().
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for name, info in META['files'].items():
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            member = archive.getmember('package/' + name)
            assert member.isfile() and member.size == info['bytes']
            data = archive.extractfile(member).read()
            assert hashlib.sha256(data).hexdigest() == info['sha256']
            file = DEST / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
assert all(valid(name, info) for name, info in META['files'].items())
print(f"Verified {META['package']}@{META['version']} in {DEST}; WASM {META['wasm_bytes']} bytes")

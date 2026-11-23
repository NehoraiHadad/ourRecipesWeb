"""Previously recorded natural voices: stress wrong-context hints on read speech."""
import hashlib
import json
from pathlib import Path
from shutil import copyfile
root = Path(__file__).resolve().parent
cache = Path('/dev/shm/hebrew-recipe-hints')
rows = json.loads((root.parent/'fresh/manifest.json').read_text())['records']
fixtures = []
for group in ('general','food-word'):
    for row in [r for r in rows if r['group']==group][:6]:
        name = row['filename']+'.pcm'
        source = Path('/dev/shm/ourrecipes-fresh-he')/name
        assert hashlib.sha256(source.read_bytes()).hexdigest()==row['pcm_sha256']
        copyfile(source,cache/name)
        fixtures.append(row)
(root/'human-manifest.json').write_text(json.dumps({'records':fixtures},ensure_ascii=False,indent=2)+'\n')

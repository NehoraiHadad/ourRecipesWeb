"""Pre-existing garlic, sugar/honey and flour/cocoa recordings, all three voices and two styles."""
import hashlib
import json
from pathlib import Path
from shutil import copyfile
root=Path(__file__).resolve().parent
cache=Path('/dev/shm/hebrew-recipe-hints')
recipes={'p03':'salad','p04':'cookies','p10':'cookies'}
rows=[]
for row in json.loads((root.parent/'styles/manifest.json').read_text())['records']:
    if row['prompt'] not in recipes or row['filter']!='raw' or row['style'] not in ('plain','fan-room'):
        continue
    name=row['filename']+'.pcm'
    path=Path('/dev/shm/kitchen-styles')/name
    assert hashlib.sha256(path.read_bytes()).hexdigest()==row['pcm_sha256']
    copyfile(path,cache/name)
    rows.append(dict(row,recipe=recipes[row['prompt']]))
assert len(rows)==18
(root/'replay-manifest.json').write_text(json.dumps({'records':rows},ensure_ascii=False,indent=2)+'\n')

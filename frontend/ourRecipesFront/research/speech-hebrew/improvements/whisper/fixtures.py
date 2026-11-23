"""Select before inference. Materialize silence and stationary noise controls locally."""
import hashlib
import json
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parent
cache = Path('/dev/shm/kitchen-styles')
read = lambda name: json.loads((root.parent / 'styles' / name).read_text())['records']
cases = []
for row in read('manifest.json'):
    if row['filter'] != 'raw':
        continue
    index = int(row['prompt'][1:])-1
    if row['style']=='plain' or (row['style']=='fan-room' and row['voice']==('omer','liat','noa')[index%3]):
        cases.append(dict(row, group=row['style']))
human = [r for r in read('human-manifest.json') if r['filter']=='raw']
for group in ('general','food-word'):
    cases.extend(dict(r,group='human') for r in [r for r in human if r['group']==group][:6])
for name, data in [('silence',np.zeros(48000)), ('noise',np.random.default_rng(42).uniform(-.01,.01,48000))]:
    key = 'whisper-control-'+name
    pcm = data.astype('<f4').tobytes()
    (cache/(key+'.pcm')).write_bytes(pcm)
    cases.append(dict(filename=key, pcm_sha256=hashlib.sha256(pcm).hexdigest(),reference='',group='control'))
assert len(cases)==62
for row in cases:
    assert hashlib.sha256((cache/(row['filename']+'.pcm')).read_bytes()).hexdigest()==row['pcm_sha256']
(root/'manifest.json').write_text(json.dumps({'records':cases},ensure_ascii=False,indent=2)+'\n')

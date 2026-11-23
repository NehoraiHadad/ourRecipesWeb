"""Apply the same fixed 140Hz filter to the 52 previously published human recordings."""
import json
import hashlib
from pathlib import Path
import numpy as np
from scipy.signal import sosfilt
from prepare import ROOT, CACHE, FILTER

source=ROOT.parent/'fresh/manifest.json'
records=[]
for row in json.loads(source.read_text())['records']:
    original=Path('/dev/shm/ourrecipes-fresh-he')/(row['filename']+'.pcm')
    data=original.read_bytes()
    assert hashlib.sha256(data).hexdigest()==row['pcm_sha256']
    raw=np.frombuffer(data,dtype='<f4')
    for arm,samples in [('raw',raw),('highpass140',sosfilt(FILTER,raw).astype('<f4'))]:
        key='human-'+row['source_id']+'-'+arm
        data=samples.tobytes()
        (CACHE/(key+'.pcm')).write_bytes(data)
        records.append(dict(filename=key,reference=row['reference'],source_id=row['source_id'],
                            filter=arm,group=row['group'],pcm_sha256=hashlib.sha256(data).hexdigest()))
(ROOT/'human-manifest.json').write_text(json.dumps({'records':records},ensure_ascii=False))

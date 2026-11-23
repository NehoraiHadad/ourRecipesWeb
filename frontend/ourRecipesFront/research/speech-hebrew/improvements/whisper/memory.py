"""One fresh browser per arm, same single clip. Sample Linux process tree PSS."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parent
fixtures = json.loads((root/'manifest.json').read_text())
results = {}
dest = root/'memory.json'
if dest.exists():
    raise FileExistsError(dest)
with tempfile.TemporaryDirectory() as tmp:
    scratch = Path(tmp)
    manifest = scratch/'one.json'
    manifest.write_text(json.dumps({'records':fixtures['records'][:1]}))
    for arm, flags in [('zipformer',{}),('whisper',{'SPEECH_WHISPER_TINY':'1'}),
                       ('whisper-he',{'SPEECH_WHISPER_HE':'1'})]:
        env = {**os.environ,'SPEECH_WHISPER_TINY':'0','SPEECH_WHISPER_HE':'0',**flags,
               'SPEECH_GREEDY_ONLY':'1','SPEECH_RESULT':str(scratch/(arm+'.json')),
               'SPEECH_MANIFEST':str(manifest),'SPEECH_NEW_CACHE':'/dev/shm/kitchen-styles'}
        run = subprocess.Popen(['node',str(root.parent/'fresh/run.mjs')],env=env)
        samples = []
        while run.poll() is None:
            lines = subprocess.check_output(['ps','-eo','pid=,ppid=,comm='],text=True).splitlines()
            tree = [line.split(None,2) for line in lines if line.strip()]
            ids = {str(run.pid)}
            while True:
                children = {pid for pid, parent, _ in tree if parent in ids}
                if children.issubset(ids):
                    break
                ids.update(children)
            total = 0
            for pid, _, cmd in tree:
                if pid not in ids or not cmd.startswith('chrom'):
                    continue
                try:
                    lines = Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines()
                    total += next(int(line.split()[1]) for line in lines if line.startswith('Pss:'))
                except (FileNotFoundError, ProcessLookupError, PermissionError):
                    pass
            if total:
                samples.append(total)
            time.sleep(.35)
        if run.returncode or not samples:
            raise RuntimeError(f'{arm}: incomplete memory measurement')
        results[arm]={'wholeBrowserPeakPssMiB':max(samples)/1024,'samples':len(samples)}
with dest.open('x') as file:
    json.dump(results,file,indent=2)

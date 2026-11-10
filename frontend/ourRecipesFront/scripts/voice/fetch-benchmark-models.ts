/** Explicit fixture download, ~1 GB. No user audio or text is transmitted. */
import { spawnSync } from 'node:child_process';
import { MODELS, modelURL } from '../../src/lib/voice/models';
const root = process.env.VOICE_MODEL_DIR || '/tmp/voice-models';
const files = Object.values(MODELS).flatMap(s => s.files.map(f => ({ url: modelURL(s, f.path), path: `${root}/${s.kind}/${f.path}`, bytes: f.bytes })));
// urllib honours the managed environment's inherited proxy and CA trust.
const code = `import sys,json,pathlib,urllib.request,time
for f in json.load(sys.stdin):
 p=pathlib.Path(f['path']);p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists() and p.stat().st_size==f['bytes']:
  print('cached',p,flush=True);continue
 start=time.monotonic();tmp=p.with_suffix(p.suffix+'.partial')
 print('Downloading',f['url'],flush=True)
 urllib.request.urlretrieve(f['url'],tmp)
 if tmp.stat().st_size!=f['bytes']:raise RuntimeError('Incorrect size: '+str(tmp))
 tmp.replace(p);print(json.dumps({'file':str(p),'bytes':f['bytes'],'seconds':time.monotonic()-start}),flush=True)
`;
const result = spawnSync('python3', ['-c', code], { input: JSON.stringify(files), stdio: ['pipe', 'inherit', 'inherit'] });
if (result.error) throw result.error;
process.exitCode = result.status || 0;

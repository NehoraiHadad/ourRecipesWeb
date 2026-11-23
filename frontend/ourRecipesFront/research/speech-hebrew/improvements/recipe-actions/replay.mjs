// Offline simulation of a conditional second decode. Both passes use the same ASR configuration.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {score} from '../../metrics.mjs';
import {suspect,reconcile} from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [corpus,inputs,hints,work] = process.argv.slice(2);
const guarded = process.argv.includes('--guarded');
assert(['dev','holdout','control','challenge','final-check'].includes(corpus) && inputs && hints && work);
const out = process.env.ASR_TRIAL_OUTPUT || here;
const read = async f=>JSON.parse(await readFile(f));
const verbs = Object.values(await read(path.join(here,'hints.json')));
const manifest = await read(path.join(inputs,'manifest.json'));
const baseFile = corpus==='dev' ? path.join(here,'../free-speech/results.json') : path.join(out,corpus+'-baseline.json');
const original = await read(guarded ? baseFile : path.join(out,corpus+'-negated.json'));
assert.deepEqual(original.externalRequests,[]);
const index = new Map(original.records.map(r=>[r.filename,r]));
assert.equal(index.size,manifest.records.length);
await mkdir(work);
for(const f of ['bpe.vocab','salad.txt']) await copyFile(path.join(inputs,f),path.join(work,f));
await copyFile(hints,path.join(work,'cookies.txt'));
const sha = b=>createHash('sha256').update(b).digest('hex');
const selected = [];
for (const row of manifest.records) {
  const first = index.get(row.filename);
  assert.equal(first.pcm_sha256,row.pcm_sha256);
  if (!suspect(first.text,verbs).length) continue;
  const pcm = await readFile(path.join(inputs,row.filename+'.pcm'));
  assert.equal(sha(pcm),row.pcm_sha256);
  const shifted = guarded ? pcm : Buffer.concat([Buffer.alloc(10240*4),pcm]);
  await writeFile(path.join(work,row.filename+'.pcm'),shifted);
  selected.push({...row,pcm_sha256:sha(shifted)});
}
const evidence = [];
if (selected.length) {
  const inputManifest = path.join(work,'manifest.json'), result = path.join(work,'shifted.json');
  await writeFile(inputManifest,JSON.stringify({records:selected}));
  execFileSync(process.execPath,[path.join(here,'../fresh/run.mjs')],{stdio:'inherit',env:{...process.env,
    SPEECH_MANIFEST:inputManifest,SPEECH_RESULT:result,SPEECH_NEW_CACHE:work,
    SPEECH_RECIPE_HINTS:'1',SPEECH_HINT_ARM:'hints-cookies'}});
  const retry = await read(result);
  assert.deepEqual(retry.externalRequests,[]);
  assert.equal(retry.records.length,selected.length);
  for (const row of retry.records) {
    const first = index.get(row.filename);
    const resolved = reconcile(first.text,row.text,verbs);
    evidence.push({file:row.filename,first:first.text,second:row.text,shiftedSha256:row.pcm_sha256,
      extraDecodeMs:row.ms,edits:resolved.edits});
    first.text = resolved.text;
    first.metrics = score(manifest.records.find(m=>m.filename===row.filename).reference,first.text);
  }
}
if (guarded) {
  for (const row of original.records) row.arm = 'guarded';
}
await writeFile(path.join(out,corpus+(guarded?'-guarded':'-retry')+'.json'),
  JSON.stringify({...original,evidence},null,2)+'\n',{flag:'wx'});

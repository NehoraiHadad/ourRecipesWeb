import {readFile,writeFile,mkdir,symlink,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {suspect} from '../recipe-actions/retry.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const [out,hints,...sources]=process.argv.slice(2);
const read=async name=>JSON.parse(await readFile(name));
const verbs=Object.values(await read(path.join(here,'../recipe-actions/hints.json')));
assert.equal(sources.length,5,'Pass dev, holdout, challenge, control and final-check PCM directories in order');
await mkdir(out);
for(const name of ['salad.txt','cookies.txt','bpe.vocab']) await copyFile(path.join(hints,name),path.join(out,name));
const records=[];
let total=0;
for(const [i,corpus] of ['dev','holdout','challenge','control','final-check'].entries()) {
  const previous=await read(path.join(here,'../recipe-actions',corpus+'-guarded.json'));
  const base=await read(corpus==='dev'?path.join(here,'../free-speech/results.json'):path.join(here,'../recipe-actions',corpus+'-baseline.json'));
  const outputs=new Map(base.records.map(r=>[r.filename,r]));
  const data=await read(path.join(sources[i],'manifest.json'));
  const inputs=new Map(data.records.map(r=>[r.filename,r]));
  for(const row of previous.records) {
    total++;
    const input=inputs.get(row.filename),first=outputs.get(row.filename);
    assert.equal(input.pcm_sha256,row.pcm_sha256);
    assert.equal(first.pcm_sha256,row.pcm_sha256);
    if(!suspect(row.text,verbs).length) continue;
    const filename=corpus+'-'+row.filename;
    await symlink(path.resolve(sources[i],row.filename+'.pcm'),path.join(out,filename+'.pcm'));
    records.push({...input,filename,first:first.text,previous:row.text});
  }
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify({total,records},null,2));
console.log('Unresolved inputs',records.length,'of',total);

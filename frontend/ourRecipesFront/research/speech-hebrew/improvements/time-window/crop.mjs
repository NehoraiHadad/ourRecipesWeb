import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {actionWindows} from './window.mjs';

const [dir,out]=process.argv.slice(2);
const read=async name=>JSON.parse(await readFile(path.join(dir,name)));
const input=await read('manifest.json'),timing=await read('timing.json');
const verbs=Object.values(JSON.parse(await readFile(new URL('../recipe-actions/hints.json',import.meta.url))));
const byName=new Map(timing.records.map(r=>[r.filename,r]));
assert.equal(byName.size,input.records.length);
await mkdir(out);
for(const name of ['cookies.txt','bpe.vocab','salad.txt']) await copyFile(path.join(dir,name),path.join(out,name));
const records=[];
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
for(const row of input.records){
  const r=byName.get(row.filename);
  assert.equal(row.first,r.text);
  assert.equal(r.pcm_sha256,row.pcm_sha256);
  const pcm=await readFile(path.join(dir,row.filename+'.pcm'));
  assert.equal(sha(pcm),r.pcm_sha256);
  for(const {index,start,end} of actionWindows(row.previous,r,verbs,pcm.length/4)){
    const cut=pcm.subarray(start*4,end*4),filename=row.filename+'-w'+index;
    await writeFile(path.join(out,filename+'.pcm'),cut);
    // No local word reference is known; the crop transcript is scored only in its parent utterance.
    records.push({filename,reference:'',pcm_sha256:sha(cut),parent:row.filename,wordIndex:index,start,end,
      first:row.previous,fullSha256:r.pcm_sha256,fullSamples:pcm.length/4});
  }
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify({total:input.total,records},null,2));

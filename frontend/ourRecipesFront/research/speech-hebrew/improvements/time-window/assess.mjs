import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {reconcile} from '../recipe-actions/retry.mjs';
import {score} from '../../metrics.mjs';
const read=async name=>JSON.parse(await readFile(name));
const [rawDir,cropDir,out]=process.argv.slice(2);
const input=await read(path.join(rawDir,'manifest.json'));
const crops=await read(path.join(cropDir,'manifest.json'));
const run=await read(path.join(cropDir,'out.json'));
const verbs=Object.values(JSON.parse(await readFile(new URL('../recipe-actions/hints.json',import.meta.url))));
const parents=new Map(input.records.map(r=>[r.filename,r])),index=new Map(run.records.map(r=>[r.filename,r]));
assert.deepEqual(run.externalRequests,[]);
assert.equal(index.size,crops.records.length);
const records=[];
for(const c of crops.records){
  const row=parents.get(c.parent),result=index.get(c.filename);
  assert.equal(c.pcm_sha256,result.pcm_sha256);
  const edits=reconcile(c.first,result.text,verbs).edits.filter(e=>e.i===c.wordIndex);
  let text=c.first;
  if(edits.length){
    const [e]=edits;
    text=text.slice(0,e.offset)+e.to+text.slice(e.offset+e.from.length);
  }
  records.push({...c,reference:row.reference,windowText:result.text,after:text,edits,
    beforeErrors:score(row.reference,c.first).wordErrors,afterErrors:score(row.reference,text).wordErrors,decodeMs:result.ms});
}
await writeFile(out,JSON.stringify({browser:run.browser,total:input.total,records},null,2)+'\n',{flag:'wx'});

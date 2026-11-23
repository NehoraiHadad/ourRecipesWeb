// Verify which second passes actually ran and that every edit is supported by their recorded text.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {suspect,reconcile,transcribeWithActionCheck} from './retry.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), out = process.env.ASR_TRIAL_OUTPUT || here;
const read = async p=>JSON.parse(await readFile(p));
const verbs = Object.values(await read(path.join(here,'hints.json')));
for(const corpus of ['dev','holdout','challenge','control','final-check']) {
  const baseline = await read(corpus==='dev' ? path.join(here,'../free-speech/results.json') : path.join(out,corpus+'-baseline.json'));
  const result = await read(path.join(out,corpus+'-guarded.json'));
  const after = new Map(result.records.map(r=>[r.filename,r]));
  const evidence = new Map(result.evidence.map(r=>[r.file,r]));
  assert.equal(evidence.size,result.evidence.length);
  assert.equal(result.records.length,baseline.records.length);
  let replaced = 0;
  for(const r of baseline.records) {
    const info = evidence.get(r.filename);
    assert.equal(Boolean(info),suspect(r.text,verbs).length>0,r.filename);
    const output = after.get(r.filename);
    assert.equal(output.pcm_sha256,r.pcm_sha256);
    let secondCalls = 0;
    const checked = await transcribeWithActionCheck(r.pcm_sha256,verbs,async()=>r.text,async input=>{
      secondCalls++;
      assert.equal(input,info.shiftedSha256);
      return info.second;
    });
    assert.equal(checked,output.text);
    assert.equal(secondCalls,info ? 1 : 0);
    if (!info) {assert.equal(output.text,r.text);continue;}
    assert.equal(info.shiftedSha256,r.pcm_sha256);
    assert.equal(info.first,r.text);
    const recovered = reconcile(r.text,info.second,verbs);
    assert.deepEqual(info.edits,recovered.edits);
    assert.equal(output.text,recovered.text);
    replaced += recovered.edits.length;
  }
  console.log(corpus,baseline.records.length,evidence.size,replaced);
}

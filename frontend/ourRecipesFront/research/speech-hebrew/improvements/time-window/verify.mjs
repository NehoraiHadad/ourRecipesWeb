import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {missing} from '../styles/anchors.mjs';
import {score} from '../../metrics.mjs';

const json=async name=>JSON.parse(await readFile(new URL(name,import.meta.url)));
const development=await json('results.json');
assert.equal(development.total,267);
assert.equal(development.records.length,16);
const edited=development.records.filter(r=>r.edits.length);
assert.equal(edited.length,2);
assert(edited.every(r=>r.afterErrors<r.beforeErrors));
for(const [filename,count] of [['screen-controls-final.json',6],['screen-new-final.json',36]]){
  const run=await json(filename);
  assert.deepEqual(run.denied,[]);assert.deepEqual(run.errors,[]);
  assert.equal(new Set(run.records.map(r=>r.name)).size,count);
  for(const r of run.records){
    assert.equal(r.trace[0].sha256,r.sha256);
    assert(r.finalMs>=r.firstMs);
    for(const stage of [r.first,r.previous,r.final]){
      assert.equal(stage.errors,score(r.reference,stage.text).wordErrors);
      assert.deepEqual(stage.missing,missing(stage.text,r.critical));
    }
  }
  if(count===6){
    for (const clip of edited){
      const r=run.records.find(r=>clip.parent.endsWith('-'+r.name));
      assert.equal(r.final.text,clip.after);
      assert.equal(r.previous.text,clip.first);
    }
    const hard=run.records.find(r=>r.name==='omer-stir-water');
    assert(hard.final.text.includes('לא יובבתי'));
    assert(hard.manual.includes('לא ערבבתי'));
    const valid=run.records.find(r=>r.name==='noa-wet-clean');
    assert.equal(valid.manual,valid.final.text);
  } else {
    assert.equal(run.records.filter(r=>r.final.text!==r.previous.text).length,0);
    const custom=run.records.find(r=>r.name==='liat-cloth-water');
    assert(custom.manual.includes('לא הרטבתי'));
  }
}
console.log('Verified automatic and manual outcomes separately.');

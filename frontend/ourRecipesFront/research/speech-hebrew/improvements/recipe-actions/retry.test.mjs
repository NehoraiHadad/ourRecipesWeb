import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suspect,reconcile,transcribeWithActionCheck} from './retry.mjs';
const verbs = ['ערבבתי','טיגנתי','בישלתי','הוספתי'];
test('Replace only a confirmed verb at a unique negated position, preserving the first transcript',()=>{
  const a = 'רגע, עוד לא יובבתי אותו. כן?';
  const b = 'טוב, עוד לא ערבבתי אותו!';
  assert.equal(reconcile(a,b,verbs).text,'רגע, עוד לא ערבבתי אותו. כן?');
  assert.equal(suspect('רגע, כבר יובבתי אותו',verbs).length,0);
  assert.equal(reconcile(a,b.replace('לא','כן'),verbs).text,a);
});
test('A confirmed word elsewhere cannot license a correction at a repeated context',()=>{
  const a = 'עוד לא יובבתי אותו, ועוד משהו, עוד לא ערבבתי אותו';
  const b = 'עוד לא יובבתי אותו, אה, עוד לא ערבבתי אותו';
  assert.equal(reconcile(a,b,verbs).text,a);
});

test('A failed optional acoustic check preserves the first transcript',async()=>{
  const input = new Float32Array(160);
  const first = 'עוד לא יובבתי אותו.';
  assert.equal(await transcribeWithActionCheck(input,verbs,async()=>first,async pcm=>{
    assert.equal(pcm,input);
    throw Error('Decoder unavailable');
  }),first);
});

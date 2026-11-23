import test from 'node:test';
import assert from 'node:assert/strict';
import {actionWindows,checkWindows} from './window.mjs';
const verbs=['ערבבתי'], pcm=new Float32Array(64000);
const text='מים, עוד לא יובבתי אותו היום.';
const timing={tokens:[' מים',',',' עוד',' לא',' יו','בבתי',' אותו',' היום','.'],
  timestamps:[0.2,.3,.8,1.1,1.4,1.5,1.9,2.2,2.4]};

test('BPE timings include the neighboring words and margins',async()=>{
  const [w]=actionWindows(text,timing,verbs,pcm.length);
  assert.equal(w.start,Math.floor((.8-.32)*16000));
  assert.equal(w.end,Math.ceil((2.2+.32)*16000));
  const result=await checkWindows(text,timing,verbs,pcm,async shortened=>{
    assert.equal(shortened.length,w.end-w.start);
    return 'עוד לא ערבבתי אותו.';
  });
  assert.equal(result,'מים, עוד לא ערבבתי אותו היום.');
});
test('Missing, mismatched, or nonmonotonic alignments leave the transcript alone',async()=>{
  for(const broken of [{}, {...timing,tokens:[' לא']}, {...timing,timestamps:timing.timestamps.toReversed()},
    {...timing,tokens:timing.tokens.map(t=>t===' לא'?' כן':t)}]){
    assert.equal(await checkWindows(text,broken,verbs,pcm,()=>assert.fail('unexpected decode')),text);
  }
});
test('A different negation context cannot license an edit',async()=>{
  assert.equal(await checkWindows(text,timing,verbs,pcm,async()=>'עוד כן ערבבתי אותו'),text);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {suspect,reconcile} from '../recipe-actions/retry.mjs';

const verbs=['ערבבתי','בישלתי','הוספתי','טיגנתי'], others=['הרטבתי','ניגבתי'];
test('Recognized alternatives in the first pass bypass retry',()=>{
  assert.equal(suspect('עוד לא ניגבתי',verbs).length,1);
  assert.equal(suspect('עוד לא ניגבתי',verbs,others).length,0);
});
test('Alternative needs matching audio context and spelling proximity',()=>{
  const first='עוד לא הרטפתי אותה';
  const checked=second=>reconcile(first,second,verbs,others).text;
  assert.equal(checked('עוד לא הרטבתי אותה'), 'עוד לא הרטבתי אותה');
  for(const second of ['כבר כן הרטבתי אותה','עוד לא הרטבתי אותו','עוד לא ניגבתי אותה',
    'עוד לא הרטבתי אותה, עוד לא הרטבתי אותה']) assert.equal(checked(second),first);
  assert.equal(reconcile('עוד לא יובבתי אותו','עוד לא ערבבתי אותו',verbs,others).text,'עוד לא ערבבתי אותו');
});

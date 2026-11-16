import test from 'node:test';import assert from 'node:assert/strict';
import {cases,robustnessCases,manifest} from './recipe_single_v2.mjs';
import {contextFor,decisionsFor,qwenRequest,score,proposalFor} from './decision_protocol_v2.mjs';
test('primary contexts are clean per recipe; old cross-recipe probes remain separate',()=>{
 assert.equal(cases.length,80);assert.equal(robustnessCases.length,8);assert.equal(manifest.robustnessInPrimaryScore,false);
 for(const c of cases.filter(c=>c.family==='single-recipe-salad')){assert.deepEqual(c.history,[]);assert.ok(!/הקודם|עברתי/.test(c.text));assert.ok(!/flour|bread-dev|קמח/.test(contextFor(c)));}
 assert.ok(robustnessCases.every(c=>c.history.some(h=>h.content.includes('הקודם'))));
 assert.ok(cases.find(c=>c.family==='reference').history.length>0);
});
test('request construction does not accumulate the previous case or mutate its history',()=>{
 const salad=cases.find(c=>c.family==='single-recipe-salad'),before=structuredClone(salad);
 contextFor(cases[0]);qwenRequest(cases[0]);
 assert.equal(qwenRequest(salad).messages.length,2);assert.equal(qwenRequest(salad).cache_prompt,false);
 assert.deepEqual(salad,before);assert.equal(decisionsFor(salad).length,4);
});
test('mixed and partial facts preserve distinct actions; binding is from frozen request',()=>{
 const c=cases.find(c=>c.id==='multiple-1');const before=structuredClone(c.state);
 const s=score(c,{intent:'report',actions:['unmentioned','done','pending','unmentioned']});
 assert.equal(s.interpretationExact,true);assert.deepEqual(c.state,before);
 assert.equal(s.proposal.expectedRevision,c.state.revision);assert.equal(s.applicationStateCommitted,false);
 const partial=cases.find(c=>c.id==='partial-1');assert.equal(score(partial,{intent:'report',actions:['unmentioned','partial','unmentioned','unmentioned']}).factsExact,true);
});
test('an unchanged state cannot hide missing negation facts or incorrect intent',()=>{
 const c=cases.find(c=>c.id==='negation-1');const s=score(c,{intent:'next',actions:['unmentioned','unmentioned','unmentioned','unmentioned']});
 assert.equal(s.stateCorrect,true);assert.equal(s.factsExact,false);assert.equal(s.intentCorrect,false);assert.equal(s.interpretationExact,false);
});
test('uncertainty and unanchored reference produce clarification without invented progress',()=>{
 const c=cases.find(c=>c.id==='uncertainty-1');const s=score(c,{intent:'clarify',actions:['unmentioned','uncertain','unmentioned','unmentioned']});
 assert.equal(s.interpretationExact,true);assert.equal(s.proposal.facts.length,0);
 const r=cases.find(c=>c.id==='reference-5');assert.deepEqual(proposalFor(r,{intent:'clarify',actions:['ambiguous','ambiguous','ambiguous','ambiguous']}).clarifications.map(c=>c.actionId),[null]);
});
test('malformed output is rejected rather than replaced with an apparently correct no-op',()=>{
 assert.throws(()=>proposalFor(cases[0],{intent:'report',actions:[]}));
 assert.throws(()=>proposalFor(cases[0],{intent:'report',actions:['invented','done','done','done']}));
});

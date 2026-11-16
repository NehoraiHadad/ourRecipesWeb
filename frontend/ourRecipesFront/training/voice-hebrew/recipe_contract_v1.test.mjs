import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,projectState,previewProposal,validateProposal} from './recipe_contract_v1.mjs';
const recipe = {id:'bread',version:'source-v1',actions:[{id:'flour',stepIndex:0,source:'200 גרם קמח'},{id:'water',stepIndex:0,source:'120 מ״ל מים'},{id:'mix',stepIndex:1,source:'לערבב'}]};
const text = 'הוספתי מים אבל עוד לא ערבבתי';
const state = () => projectState(recipe,{flour:'done',water:'pending',mix:'pending'},4,1);
const fact = (actionId,status,quote) => ({actionId,status,evidence:{quote,start:text.indexOf(quote),end:text.indexOf(quote)+quote.length}});
const proposal = () => ({contractVersion:1,recipeId:recipe.id,recipeVersion:recipe.version,expectedRevision:4,intents:['report','next'],facts:[fact('water','done','הוספתי מים'),fact('mix','pending','עוד לא ערבבתי')],clarifications:[]});

test('mixed positive and negative report previews atomically without mutating input',()=>{
 const s=state(),before=structuredClone(s),r=previewProposal(proposal(),recipe,s,text);
 assert.deepEqual(s,before);assert.deepEqual(r.proposedState.completedActionIds,['flour','water']);
 assert.deepEqual(r.proposedState.remainingActionIds,['mix']);assert.equal(r.proposedState.revision,5);
 assert.equal(r.proposedState.currentStepIndex,1);assert.equal(r.applicationStateCommitted,false);assert.equal(r.requiresUserConfirmation,true);
});
test('partial action remains outstanding; no residual quantity is invented',()=>{
 const p=proposal();p.facts=[fact('water','partial','הוספתי מים')];
 const r=previewProposal(p,recipe,state(),text).proposedState;
 assert.deepEqual(r.partialActionIds,['water']);assert.deepEqual(r.remainingActionIds,['water','mix']);assert.equal(r.nextActionId,'water');
 assert.equal('remainingAmount' in r,false);
});
test('correction can reopen completed work and recompute derived lists',()=>{
 const s=projectState(recipe,{flour:'done',water:'done',mix:'done'},4,1),p=proposal();
 p.facts=[fact('water','pending','הוספתי מים')];
 const r=previewProposal(p,recipe,s,text);
 assert.deepEqual(r.proposedState.remainingActionIds,['water']);assert.equal(r.semanticTruthVerified,false);
});
test('stale response is rejected after a revision, recipe switch, or source edit',()=>{
 for(const [r,s] of [[recipe,{...state(),revision:5}],[{...recipe,id:'other'},state()],[{...recipe,version:'source-v2'},state()]])assert.throws(()=>previewProposal(proposal(),r,s,text));
});
test('one invalid fact prevents all preview updates',()=>{
 const s=state(),p=proposal(),before=structuredClone(s);p.facts.push(fact('oil','done','מים'));
 assert.throws(()=>previewProposal(p,recipe,s,text));assert.deepEqual(s,before);
});
test('duplicate ids, fabricated evidence and changed quote offsets fail validation',()=>{
 const variants=[p=>p.facts.push(p.facts[0]),p=>p.facts[0].evidence.quote='שמתי שמן',p=>p.facts[0].evidence.start++];
 for(const mutate of variants){const p=proposal();mutate(p);assert.throws(()=>validateProposal(p,recipe,state(),text));}
});
test('clear action and separate ambiguous action can coexist without guessing',()=>{
 const p=proposal();p.intents=['report','clarify'];p.facts=[p.facts[0]];p.clarifications=[{actionId:'mix',question:'האם כבר ערבבת?'}];
 const r=previewProposal(p,recipe,state(),text).proposedState;assert.equal(r.progress.water,'done');assert.equal(r.progress.mix,'pending');
 p.clarifications[0].actionId='water';assert.throws(()=>validateProposal(p,recipe,state(),text));
});
test('question/clarification without facts leaves progress and revision unchanged',()=>{
 const p=proposal();p.intents=['clarify'];p.facts=[];p.clarifications=[{actionId:null,question:'איזו פעולה ביצעת?'}];
 const s=state();assert.deepEqual(previewProposal(p,recipe,s,text).proposedState,s);
 p.facts=[fact('water','done','מים')];assert.throws(()=>validateProposal(p,recipe,s,text));
});
test('finished state has no next action; fresh recipe has no carryover',()=>{
 assert.equal(projectState(recipe,{flour:'done',water:'done',mix:'done'}).nextActionId,null);
 const next={id:'salad',version:'v1',actions:[{id:'cut',stepIndex:0,source:'לחתוך מלפפון'}]};
 assert.deepEqual(initialState(next).progress,{cut:'pending'});
});
test('exact evidence can still be semantically wrong: validator does not claim truth',()=>{
 const p=proposal();p.facts=[fact('mix','done','עוד לא ערבבתי')];
 const result=previewProposal(p,recipe,state(),text);
 assert.equal(result.proposedState.progress.mix,'done');assert.equal(result.semanticTruthVerified,false);assert.equal(result.requiresUserConfirmation,true);
});

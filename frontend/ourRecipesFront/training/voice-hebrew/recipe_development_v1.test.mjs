import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,manifest} from './recipe_development_v1.mjs';
import {validateProposal,previewProposal} from './recipe_contract_v1.mjs';
test('all 80 development fixtures have unique ids, bounded families and valid proposals',()=>{
 assert.equal(cases.length,80);assert.equal(new Set(cases.map(c=>c.id)).size,80);
 assert.equal(Object.keys(manifest.families).length,10);assert.ok(Object.values(manifest.families).every(n=>n===8));
 for(const c of cases){validateProposal(c.expectedProposal,c.recipe,c.state,c.text);const s=structuredClone(c.state);previewProposal(c.expectedProposal,c.recipe,c.state,c.text);assert.deepEqual(c.state,s);}
});
test('fixtures keep correction history, unresolved references and recipe switches explicit',()=>{
 assert.ok(cases.filter(c=>c.family==='correction').every(c=>c.history.length));
 assert.ok(cases.filter(c=>c.family==='reference').some(c=>c.expectedProposal.clarifications.length));
 assert.ok(cases.filter(c=>c.family==='recipe-switch').every(c=>c.recipe.id==='salad-dev-v1'&&!('flour' in c.state.progress)));
 assert.equal(manifest.humanReviewed,false);assert.equal(manifest.heldOut,false);
});

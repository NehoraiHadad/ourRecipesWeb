import test from 'node:test';import assert from 'node:assert/strict';
import {summarize} from './single_recipe_report.mjs';
const sample=rows=>({arm:'fixture',plan:{study:'code-test',data_file:'not-compact'},completed:false,rows});
test('invalid outputs stay in both required-change and read-only denominators',()=>{
 const report=summarize(sample([{id:'clear-1',interpretation:null,ms:1},{id:'negation-1',interpretation:null,ms:1}]));
 assert.equal(report.metrics.cases,2);assert.equal(report.metrics.invalidOutputs,2);
 assert.equal(report.requiredChangeMetrics.cases,1);assert.equal(report.requiredChangeMetrics.stateCorrect,0);
 assert.equal(report.readonlyMetrics.cases,1);assert.equal(report.readonlyMetrics.stateCorrect,0);
});
test('duplicate ids, old mixed-history stress ids and false completion labels cannot inflate results',()=>{
 const row={id:'clear-1',interpretation:null,ms:1};
 assert.throws(()=>summarize(sample([row,row])));
 assert.throws(()=>summarize(sample([{...row,id:'recipe-switch-1'}])));
 assert.throws(()=>summarize({...sample([row]),completed:true}));
});

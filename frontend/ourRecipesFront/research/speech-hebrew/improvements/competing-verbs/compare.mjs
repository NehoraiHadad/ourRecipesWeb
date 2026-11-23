// Paired, automatic transcripts only. A clip counts once per condition, even if several phrases fail.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalize,score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';
import {suspect} from '../recipe-actions/retry.mjs';

const read=async file=>JSON.parse(await readFile(new URL(file,import.meta.url)));
const verbs=Object.values(await read('../recipe-actions/hints.json'));
const negations=text=>normalize(text).split(' ').filter(word=>['לא','שלא','ולא','ושלא'].includes(word));
function tally(){
  return {intact:0,errors:0,prompts:0,retries:0};
}
function compare(rows,originals){
  const base=new Map(originals.map(r=>[r.name,r]));
  assert.equal(base.size,rows.length);
  assert.equal(new Set(rows.map(r=>r.name)).size,rows.length);
  const conditions={},changes=[];
  for(const row of rows){
    const prev=base.get(row.name);
    assert.equal(row.sha256,prev.sha256);
    assert.equal(row.reference,prev.reference);
    assert.deepEqual(row.critical,prev.critical);
    assert.equal(row.trace[0].sha256,row.sha256);
    assert.deepEqual(row.first,prev.first);
    const group=row.name.endsWith('-water')?'water':row.name.endsWith('-clean')?'clean':'other';
    const stats=conditions[group]??={n:0,words:0,old:tally(),candidate:tally()};
    stats.n++;
    stats.words+=score(row.reference,row.final.text).referenceWords;
    for(const [r,key] of [[prev,'old'],[row,'candidate']]){
      const s=stats[key];
      const metrics=score(row.reference,r.final.text);
      const omissions=missing(r.final.text,row.critical);
      assert.equal(metrics.wordErrors,r.final.errors);
      assert.deepEqual(omissions,r.final.missing);
      s.intact+=Number(!omissions.length);
      s.errors+=metrics.wordErrors;
      s.prompts+=Number(r.clarify);
      s.retries+=Number(r.retried ?? (r.trace.length>1));
    }
    assert.deepEqual(negations(row.final.text),negations(prev.final.text));
    if(row.final.text!==prev.final.text) changes.push({name:row.name,reference:row.reference,
      before:prev.final.text,after:row.final.text,deltaErrors:row.final.errors-prev.final.errors});
  }
  return {conditions,changes};
}
const result={};
const preserved=process.argv.includes('--preserved');
const variant=preserved?'preserved':'candidate';
for(const [key,baseline,candidate,count] of [
  ['development','../time-window/screen-new-final.json',preserved?'preserved-development.json':'development.json',36],
  ['fresh','fresh-baseline.json',preserved?'preserved-fresh.json':'fresh-candidate.json',36],
  ['contrast','contrast/baseline.json','contrast/'+variant+'.json',18]]){
  const [old,updated]=await Promise.all([baseline,candidate].map(read));
  for(const run of [old,updated]){
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.denied,[]);
    assert.equal(run.records.length,count);
  }
  result[key]=compare(updated.records,old.records);
}
const controls=await read(preserved?'preserved-controls.json':'controls.json');
assert.deepEqual(controls.errors,[]);assert.deepEqual(controls.denied,[]);
assert.equal(controls.records.length,21);
const triggered=new Map();
for (const corpus of ['dev','holdout','challenge','control','final-check']) {
  const run=await read('../recipe-actions/'+corpus+'-guarded.json');
  for (const item of run.evidence) triggered.set(corpus+'-'+item.file,item);
}
assert.equal(triggered.size,controls.records.length);
for (const row of controls.records) {
  const original=triggered.get(row.name);
  assert.equal(original.shiftedSha256,row.sha256);
  assert.equal(original.first,row.first.text);
}
result.controls=compare(controls.records,controls.records.map(r=>({...r,
  final:{text:r.old,errors:score(r.reference,r.old).wordErrors,missing:missing(r.old,r.critical)},
  clarify:suspect(r.old,verbs).length>0,retried:triggered.has(r.name)})));
if (preserved) {
  const runs=await Promise.all(['latency-baseline.json','latency-preserved.json'].map(read));
  const times={};
  for (const [i,run] of runs.entries()) {
    assert.equal(run.records.length,9);
    assert.deepEqual(run.denied,[]);assert.deepEqual(run.errors,[]);
    for (const [j,row] of run.records.entries()) {
      const baseline=runs[0].records[j];
      assert.equal(row.name,baseline.name);assert.equal(row.sha256,baseline.sha256);
      assert.equal(row.trace[0].sha256,row.sha256);
      const name=row.name.replace(/-[0-2]$/,'');
      const pair=times[name]??=[[],[]];
      pair[i].push(row.finalMs);
    }
  }
  result.latencyMedianMs={};
  for (const [name,pair] of Object.entries(times)) {
    result.latencyMedianMs[name]=pair.map(values=>{
      assert.equal(values.length,3);
      return values.sort((a,b)=>a-b)[1];
    });
  }
}
console.log(JSON.stringify(result,null,2));

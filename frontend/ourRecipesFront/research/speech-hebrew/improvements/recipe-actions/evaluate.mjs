import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {normalize, score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';

const read = async name => {
  const useOutput = process.env.ASR_TRIAL_OUTPUT && !name.startsWith('../') && name!=='hints.json';
  const file = useOutput ? path.join(process.env.ASR_TRIAL_OUTPUT,name) : new URL(name,import.meta.url);
  return JSON.parse(await readFile(file));
};
const verbs = Object.values(await read('hints.json'));
function counts(text) {
  const tally = Object.fromEntries([...verbs,'לא'].map(word=>[word,0]));
  for (const w of normalize(text).split(' ')) {
    for (const v of verbs) {
      if ([v,'ו'+v,'ש'+v,'וש'+v].includes(w)) tally[v]++;
    }
    if (['לא','ולא','שלא','ושלא'].includes(w)) tally['לא']++;
  }
  return tally;
}
function stats() {
  return {errors:0,criticalIntact:0,finalIntact:0,excessVerbTokens:0,missingVerbTokens:0,negationCountFlags:0};
}
async function compare(manifestPath, baselinePath, actionsPath, expectedCount) {
  const [manifest,baseline,actions] = await Promise.all([manifestPath,baselinePath,actionsPath].map(read));
  const runs = [baseline,actions].map(run=>{
    assert.deepEqual(run.externalRequests,[]);
    const index = new Map(run.records.map(r=>[r.filename,r]));
    assert.equal(run.records.length,expectedCount);
    assert.equal(index.size,expectedCount);
    return index;
  });
  assert.equal(new Set(manifest.records.map(r=>r.filename)).size,expectedCount);
  const groups = {}, changes = [], flags = [];
  for (const row of manifest.records) {
    const pair = runs.map(index=>index.get(row.filename));
    const group = groups[row.style] ??= {clips:0,words:0,base:stats(),actions:stats(),recovered:0,lost:0};
    group.clips++;
    const gold = counts(row.reference);
    const missingBeforeAfter = [];
    for (const [i,r] of pair.entries()) {
      assert.equal(r.arm, i===0 ? 'hints-salad' : actionsPath.endsWith('-guarded.json') ? 'guarded' : 'hints-cookies');
      assert.equal(r.pcm_sha256,row.pcm_sha256);
      assert.deepEqual(score(row.reference,r.text),r.metrics);
      const metrics = i===0 ? group.base : group.actions;
      if (i===0) group.words += r.metrics.referenceWords;
      metrics.errors += r.metrics.wordErrors;
      const lost = missing(r.text,row.critical);
      missingBeforeAfter.push(lost);
      metrics.criticalIntact += Number(lost.length===0);
      if(row.final) metrics.finalIntact += Number(missing(r.text,row.final).length===0);
      const found = counts(r.text);
      for (const v of verbs) {
        metrics.excessVerbTokens += Math.max(found[v]-gold[v],0);
        metrics.missingVerbTokens += Math.max(gold[v]-found[v],0);
      }
      metrics.negationCountFlags += Number(found['לא']!==gold['לא']);
    }
    const [before,after] = missingBeforeAfter;
    group.recovered += Number(before.length>0 && !after.length);
    group.lost += Number(!before.length && after.length>0);
    const [baseTokens, actionTokens] = pair.map(r=>counts(r.text));
    for (const token of [...verbs,'לא']) {
      const oldDelta = baseTokens[token]-gold[token], newDelta = actionTokens[token]-gold[token];
      if ((newDelta>0 && newDelta>oldDelta) || (newDelta<0 && newDelta<oldDelta)) {
        flags.push({clip:row.filename, token, oldDelta, newDelta});
      }
    }
    if(normalize(pair[0].text)!==normalize(pair[1].text)) {
      changes.push({file:row.filename,reference:row.reference,before:pair[0].text,after:pair[1].text,
        missingBefore:before,missingAfter:after});
    }
  }
  for(const [style,g] of Object.entries(groups)) {
    for(const arm of [g.base,g.actions]) {
      if(!manifest.records.some(r=>r.style===style && r.final)) delete arm.finalIntact;
      if(!manifest.records.some(r=>r.style===style && r.critical.length)) delete arm.criticalIntact;
    }
  }
  return {groups,changes,flags};
}
const name = ['guarded','retry','weighted','negated'].find(s=>process.argv.includes('--'+s)) ?? 'actions';
const dev = await compare('../free-speech/manifest.json','../free-speech/results.json',`dev-${name}.json`,96);
const report = {dev};
if(!process.argv.includes('--dev')) {
  report.holdout = await compare('holdout-manifest.json','holdout-baseline.json',`holdout-${name}.json`,72);
}
if(process.argv.includes('--controls')) {
  report.control = await compare('control-manifest.json','control-baseline.json',`control-${name}.json`,15);
}
if(process.argv.includes('--challenge')) {
  report.challenge = await compare('challenge-manifest.json','challenge-baseline.json',`challenge-${name}.json`,48);
}
if(process.argv.includes('--final-check')) {
  report.final = await compare('final-check-manifest.json','final-check-baseline.json',`final-check-${name}.json`,36);
}
console.log(JSON.stringify(report,null,2));

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalize,score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';

const json = async name => JSON.parse(await readFile(new URL(name,import.meta.url)));
const source = [...(await json('../rnnoise/results.json')).records,...(await json('../rnnoise/confirmation.json')).records];
const byFile = new Map(source.map(r=>[r.file,r]));
const [arg,combinedArg] = process.argv.slice(2).filter(a=>!a.startsWith('--'));
const run = arg ? JSON.parse(await readFile(arg)) : await json(process.argv.includes('--corrections') ? 'correction-results.json' : 'results.json');
const correction = process.argv.includes('--corrections');
const cases = correction ? await json('corrections.json') : [];
if (correction) {
  const baseline = run.records.filter(r=>r.arm==='beam4');
  for (const r of baseline) {
    const c = cases.find(c=>r.filename.endsWith('-'+c.id));
    assert(c);
    byFile.set(r.filename+'.pcm',{...c, reference:c.text, group:'corrections', condition:'clean',
      sha256:r.pcm_sha256,raw:{text:r.text}});
  }
}
const phrases = ['רוטב עגבניות','שמן זית','פלפל שחור'];

function occurrences(text,phrase) {
  const words = normalize(text).split(' ');
  const [first,second] = phrase.split(' ');
  const starts = new Set(['','ה','ב','ל','מ','ו','וה'].map(p=>p+first));
  return words.filter((word,i)=>starts.has(word) && words[i+1]===second).length;
}

const arms = {greedy:'greedy', beam4:'beam4', 'hints-salad':'heads', 'hints-cookies':'phrases'};
if (process.argv.includes('--combined')) {
  const extraRun = combinedArg ? JSON.parse(await readFile(combinedArg)) : await json(correction ? 'combined-corrections.json' : 'combined-results.json');
  assert.deepEqual(extraRun.externalRequests,[]);
  assert(extraRun.records.every(r=>r.arm==='hints-cookies'));
  arms.combined = 'combined';
  run.records.push(...extraRun.records.map(r=>({...r,arm:'combined'})));
}
assert.deepEqual(run.externalRequests,[]);
const summary = {}, changes = [];
const seen = new Set();
for (const r of run.records) {
  const item = byFile.get(r.filename+'.pcm');
  assert.equal(item.sha256,r.pcm_sha256);
  const arm = arms[r.arm], id = arm+'/'+r.filename;
  assert(arm && !seen.has(id));
  seen.add(id);
  const s = score(item.reference,r.text);
  assert.deepEqual(s,r.metrics);
  if (arm === 'beam4') assert.equal(r.text,item.raw.text);
  const group = summary[arm] ??= {clips:0,words:0,errors:0,anchorsLost:0,negationFlags:0,
    targets:0,hits:0,extra:0,byPhrase:{},byCondition:{},alternatives:{}};
  group.clips++;
  group.words += s.referenceWords;
  group.errors += s.wordErrors;
  group.negationFlags += Number(s.negationCountDelta !== 0);
  group.anchorsLost += missing(r.text,item.anchors).length;
  const condition = item.group+'/'+item.condition;
  const bucket = group.byCondition[condition] ??= {errors:0,hits:0,targets:0,extra:0};
  bucket.errors += s.wordErrors;
  for (const other of ['פלפל אדום','פלפל לבן','רוטב סויה','שמן קנולה']) {
    const tally = group.alternatives[other] ??= {hits:0,targets:0};
    const gold = occurrences(item.reference,other);
    tally.targets += gold;
    tally.hits += Math.min(occurrences(r.text,other),gold);
  }
  for (const phrase of phrases) {
    const stats = group.byPhrase[phrase] ??= {hits:0,targets:0,extra:0};
    const gold = occurrences(item.reference,phrase), got = occurrences(r.text,phrase);
    for (const tally of [group,stats,bucket]) {
      tally.hits += Math.min(gold,got);
      tally.targets += gold;
      tally.extra += Math.max(0,got-gold);
    }
  }
  if (['combined','phrases'].includes(arm) && normalize(item.raw.text)!==normalize(r.text)) {
    changes.push({arm,clip:r.filename,reference:item.reference,raw:item.raw.text,phrases:r.text});
  }
}
const clips = correction ? 18 : 60;
assert.equal(seen.size,clips*Object.keys(arms).length);
assert(Object.values(summary).every(s=>s.clips===clips));
console.log(JSON.stringify({summary,changes},null,2));

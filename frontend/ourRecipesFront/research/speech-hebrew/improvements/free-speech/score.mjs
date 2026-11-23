import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';

const read = async file => JSON.parse(await readFile(file,'utf8'));
const [manifest,run] = await Promise.all(['manifest.json','results.json'].map((name,i)=>
  read(process.argv[i+2] || new URL(name,import.meta.url))));
assert.deepEqual(run.externalRequests,[]);
const byName = new Map(run.records.map(r=>[r.filename,r]));
assert.equal(byName.size,96);
assert.equal(run.records.length,byName.size);
assert.equal(manifest.records.length,byName.size);
const styles = {}, detail = [];
for (const r of manifest.records) {
  const output = byName.get(r.filename);
  assert.equal(output.pcm_sha256,r.pcm_sha256);
  assert.equal(output.arm,'hints-salad');
  assert.deepEqual(output.metrics,score(r.reference,output.text));
  assert.deepEqual(missing(r.reference,r.final),[]);
  assert.deepEqual(missing(r.reference,r.critical),[]);
  const essential = missing(output.text,r.critical);
  const finalPhrase = missing(output.text,r.final);
  const bucket = styles[r.style] ??= {clips:0,wordErrors:0,referenceWords:0,finalPhraseIntact:0,
    allCriticalIntact:0,criticalKept:0,criticalTotal:0,negationCountMismatches:0};
  bucket.clips++;
  bucket.wordErrors += output.metrics.wordErrors;
  bucket.referenceWords += output.metrics.referenceWords;
  bucket.finalPhraseIntact += Number(!finalPhrase.length);
  bucket.allCriticalIntact += Number(!essential.length);
  bucket.criticalKept += r.critical.length-essential.length;
  bucket.criticalTotal += r.critical.length;
  bucket.negationCountMismatches += Number(output.metrics.negationCountDelta!==0);
  detail.push({id:r.filename,finalPhraseIntact:!finalPhrase.length,missingCritical:essential});
}
assert.equal(new Set(detail.map(r=>r.id)).size,96);
assert(Object.values(styles).every(r=>r.clips===24));
console.log(JSON.stringify({styles,detail},null,2));

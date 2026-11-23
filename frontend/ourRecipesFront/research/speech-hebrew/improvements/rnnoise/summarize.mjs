import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';

const byGroup = {};
const ms = [];
const seen = new Set();
const inputs = process.argv.slice(2);
assert(inputs.length === 0 || inputs.length === 2, 'Provide both result files or neither');
const files = inputs.length ? inputs : ['results.json','confirmation.json'].map(f=>new URL(f,import.meta.url));
for (const [i,file] of files.entries()) {
  const expected = [75,24][i];
  const run = JSON.parse(await readFile(file));
  assert.equal(run.records.length,expected);
  assert.deepEqual(run.externalRequests,[]);
  for (const row of run.records) {
    assert(!seen.has(row.file));
    seen.add(row.file);
    assert.equal(row.sha256,row.raw.inputSha256);
    const id = row.group+'/'+row.condition;
    const g = byGroup[id] ??= {clips:0,words:0,anchors:0,arms:{},better:0,same:0,worse:0};
    g.clips++;
    g.words += row.raw.words;
    g.anchors += row.anchors.length;
    g[row.filtered.wordErrors < row.raw.wordErrors ? 'better' : row.filtered.wordErrors === row.raw.wordErrors ? 'same' : 'worse']++;
    for (const arm of ['raw','filtered']) {
      const totals = g.arms[arm] ??= {errors:0,anchorsKept:0,negationCountFlags:0};
      const r = row[arm], s = score(row.reference,r.text);
      assert.equal(s.wordErrors,r.wordErrors);
      assert.equal(s.referenceWords,r.words);
      assert.equal(s.negationCountDelta,r.negationCountDelta);
      assert.deepEqual(missing(r.text,row.anchors),r.missingAnchors);
      totals.errors += r.wordErrors;
      totals.anchorsKept += row.anchors.length-r.missingAnchors.length;
      totals.negationCountFlags += Number(r.negationCountDelta !== 0);
    }
    ms.push(row.filtered.preprocessMs);
  }
}
ms.sort((a,b)=>a-b);
console.log(JSON.stringify({byGroup,filterMsMedian:ms[Math.floor(ms.length/2)],
  filterMsP95:ms[Math.ceil(ms.length*.95)-1]},null,2));

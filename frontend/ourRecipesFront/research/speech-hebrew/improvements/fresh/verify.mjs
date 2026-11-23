import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score, normalize } from '../../metrics.mjs';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const oldFixtures = (await read('../../evidence/human-fixtures.json')).records;
const manifest = await read('./manifest.json');
const results = await read('./results.json');
const oldIds = new Set(oldFixtures.map(row => String(row.source_id)));
const oldReferences = new Set(oldFixtures.map(row => normalize(row.text)));
const fixtures = new Map(manifest.records.map(row => [row.filename, row]));
assert.equal(fixtures.size, manifest.records.length);
assert.equal(new Set(manifest.records.map(row => row.source_id)).size, fixtures.size);
for (const row of fixtures.values()) {
  assert(!oldIds.has(row.source_id));
  assert(!oldReferences.has(normalize(row.reference)));
}
const seen = new Set();
for (const row of results.records) {
  const fixture = fixtures.get(row.filename);
  assert(['greedy', 'beam4'].includes(row.arm));
  const key = row.arm + '/' + row.filename;
  assert(!seen.has(key));
  seen.add(key);
  assert.equal(row.pcm_sha256, fixture.pcm_sha256);
  assert.deepEqual(score(fixture.reference, row.text), row.metrics);
}
assert.equal(seen.size, fixtures.size * 2);
assert.deepEqual(results.externalRequests, []);

const historic = (await read('../evidence/browser-full.json')).records;
const inputs = (await read('../evidence/input-reconstruction.json')).records;
const cases = await read('../../cases.json');
const handoff = (await readFile(new URL('./cooking-pairs.jsonl', import.meta.url), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
const syntheticIds = inputs.filter(row => row.source === 'synthetic-loopback').map(row => row.id);
assert.deepEqual(handoff.map(row => row.id).sort(), syntheticIds.sort());
for (const row of handoff) {
  const fixture = inputs.find(input => input.id === row.id);
  const prompt = cases.find(entry => entry.id === row.case_id);
  assert.equal(row.reference, prompt.text);
  assert.equal(row.family, prompt.family);
  assert.equal(row.condition, fixture.condition);
  for (const arm of ['greedy', 'beam4']) {
    const record = historic.find(entry => entry.arm === arm && entry.id === row.id);
    assert.equal(row[arm], record.text);
    assert.equal(row.pcm_sha256, record.inputSha256);
  }
}
console.log('Verified', seen.size, 'new results and', handoff.length, 'historical paired kitchen fixtures');

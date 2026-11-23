// Exploratory literal preservation on the exposed synthetic utterances.
import {readFile} from 'node:fs/promises';
import {normalize} from '../../metrics.mjs';
const pairs = (await readFile(new URL('../fresh/cooking-pairs.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse);
// Case-scoped lexical checks. Counts apply to this word in this case only.
const probes = [
  ['water-not-mixed','ערבבתי'], ['water-not-mixed','עוד לא'], ['mixed-half','ערבבתי'],
  ['mixed-half','חצי'], ['oven-not-yet','הדלקתי'], ['oven-not-yet','התנור'],
  ['plan-egg','מתכנן'], ['plan-egg','ביצה'], ['salt-sugar','מלח'], ['salt-sugar','סוכר'],
  ['water-actually-oil','בעצם לא'], ['water-actually-oil','הוספתי'], ['water-actually-oil','שמן'],
];
const has = (text,term) => (' '+normalize(text)+' ').includes(' '+term+' ');
const summary = probes.map(([scenario,term])=>{
  const rows = pairs.filter(row=>row.case_id===scenario);
  if (rows.length!==9 || rows.some(row=>!has(row.reference,term))) throw new Error('Unexpected fixtures');
  const count = arm => rows.filter(row=>has(row[arm],term)).length;
  return {scenario,term,total:rows.length,greedy:count('greedy'),beam4:count('beam4'),
    greedyMisses:rows.filter(row=>!has(row.greedy,term)).map(row=>({id:row.id,text:row.greedy}))};
});
console.log(JSON.stringify(summary,null,2));

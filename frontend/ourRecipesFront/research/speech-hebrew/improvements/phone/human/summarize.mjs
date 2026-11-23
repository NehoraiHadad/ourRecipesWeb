import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalize, score} from '../../../metrics.mjs';

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)));
const {records} = await read('fixtures.json');
const {runs} = await read('results.json');
const recipes = await read('../../recipe-hints/recipes.json');
const fixtures = new Map(records.map(row => [row.file,row]));
const matchingRecipe = {'1602':'salad','1620':'cookies'};
const negativePhrases = {'1599':['לא השתנתה'], '1577':['לא היה נראה','לא היה הוגן'], '1654':['לא יודע','או לא']};
const summary = {};
for (const run of runs.filter(r => r.input === 'file')) {
  const item = fixtures.get(run.file);
  const match = matchingRecipe[item.source_id];
  for (const arm of ['hinted','plain']) {
    if (arm === 'plain' && match && match !== run.recipe) continue; // Same recording decoded twice.
    const group = match ? (arm === 'plain' ? 'food:plain' : 'food:'+ (run.recipe === match ? 'matched' : 'swapped')) : 'negation:'+arm;
    const out = summary[group] ??= {clips:0,words:0,errors:0,ingredientHits:0,ingredientTotal:0,
      negationCountMismatches:0,negatedPhrasesPresent:0,negatedPhrasesTotal:0,extraRecipeNouns:[]};
    const {transcript,wordErrors,referenceWords,ingredientMentions,negationCountDelta} = run[arm];
    assert.equal(wordErrors,score(item.reference,transcript).wordErrors);
    out.clips++;
    out.errors += wordErrors;
    out.words += referenceWords;
    const target = {'1602':'שמן','1620':'סוכר'}[item.source_id];
    if (target) {
      const expected = normalize(item.reference).split(' ').filter(w => w === target || w === 'ב'+target).length;
      out.ingredientHits += Math.min(ingredientMentions,expected);
      out.ingredientTotal += expected;
    }
    const text = ' '+normalize(transcript)+' ';
    const ref = ' '+normalize(item.reference)+' ';
    for (const noun of recipes[run.recipe]) {
      const forms = ['','ה','ב','ל','מ','ו','וה'].map(p => ' '+p+noun+' ');
      if (forms.some(form => text.includes(form)) && !forms.some(form => ref.includes(form))) {
        out.extraRecipeNouns.push({file:item.file,noun});
      }
    }
    out.negationCountMismatches += Number(negationCountDelta !== 0);
    for (const phrase of negativePhrases[item.source_id] ?? []) {
      out.negatedPhrasesPresent += Number(text.includes(' '+phrase+' '));
      out.negatedPhrasesTotal++;
    }
  }
}
assert.equal(summary['food:plain'].clips,6);
assert.equal(summary['negation:plain'].clips,7);
console.log(JSON.stringify(summary,null,2));
const water = (await read('water-results.json')).runs;
const byCondition = {};
for (const snr of ['clean',10,0]) {
  const rows = water.filter(r => r.mix.snrDb === (snr === 'clean' ? 10 : snr)).map(r => {
    if (snr !== 'clean') return r;
    return runs.find(v => v.input === 'file' && v.file === r.file && v.recipe === r.recipe);
  });
  assert.equal(rows.length,4);
  for (const arm of ['hinted','plain']) {
    const tally = {errors:0,words:0,negatedPhrasesPresent:0,negatedPhrasesTotal:0,ingredients:0};
    for (const r of rows) {
      tally.errors += r[arm].wordErrors;
      tally.words += r[arm].referenceWords;
      tally.ingredients += r[arm].ingredientMentions ?? 0;
      for (const phrase of negativePhrases[r.source_id] ?? []) {
        tally.negatedPhrasesTotal++;
        tally.negatedPhrasesPresent += Number((' '+normalize(r[arm].transcript)+' ').includes(' '+phrase+' '));
      }
    }
    byCondition[snr+'/'+arm] = tally;
  }
}
console.log(JSON.stringify(byCondition,null,2));

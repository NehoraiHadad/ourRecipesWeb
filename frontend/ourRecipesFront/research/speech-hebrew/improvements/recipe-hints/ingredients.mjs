// Count distinct in-recipe nouns per utterance, and newly inserted noun identities.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {normalize,score} from '../../metrics.mjs';
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url)));
const recipes=await read('recipes.json');
function nouns(text,list){
  const words=new Set(normalize(text).split(' '));
  return list.filter(n=>['','ה','ב','ל','מ','ו','וה'].some(p=>words.has(p+n)));
}
const report={};
for(const [suite,prefix] of [['cooking',''],['human','human-'],['replay','replay-']]){
 const fixtures=(await read(prefix+'manifest.json')).records, result=await read(prefix+'results.json');
 assert.equal(result.records.length,fixtures.length*4);assert.deepEqual(result.externalRequests,[]);
 const output=new Map(result.records.map(r=>[r.filename+'/'+r.arm,r]));
 assert.equal(output.size,result.records.length);
 const groups={},newIntrusions=[];
 for(const f of fixtures){
  for(const arm of ['greedy','beam4','hints-salad','hints-cookies']){
   const r=output.get(f.filename+'/'+arm);assert.equal(r.pcm_sha256,f.pcm_sha256);
   const evaluation=score(f.reference,r.text);assert.deepEqual(evaluation,r.metrics);
   if(f.reference==='')continue;
   const recipe=arm.startsWith('hints-')?arm.slice(6):null;
   const group=suite!=='human' && recipe?(f.recipe===recipe?'matching':'swapped'):arm;
   const counts=groups[group]??={words:0,wordErrors:0,expectedNouns:0,missedNouns:0,negationFlags:0};
   const list=suite!=='human'?recipes[f.recipe]:[...recipes.salad,...recipes.cookies];
   const gold=nouns(f.reference,list);
   counts.words+=evaluation.referenceWords;counts.wordErrors+=evaluation.wordErrors;
   counts.negationFlags+=Number(evaluation.negationCountDelta!==0);
   counts.expectedNouns+=gold.length;counts.missedNouns+=gold.filter(n=>!nouns(r.text,list).includes(n)).length;
   if(recipe){
    const beam=output.get(f.filename+'/beam4');
    for(const n of nouns(r.text,recipes[recipe])){
     if(!nouns(f.reference,recipes[recipe]).includes(n)&&!nouns(beam.text,recipes[recipe]).includes(n))
      newIntrusions.push({id:f.filename,arm,noun:n,reference:f.reference,beam4:beam.text,hinted:r.text});
    }
   }
  }
 }
 report[suite]={groups,newIntrusions};
}
if(process.argv.includes('--verify'))assert.deepEqual(await read('ingredients.json'),report);
else await writeFile(new URL('ingredients.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));

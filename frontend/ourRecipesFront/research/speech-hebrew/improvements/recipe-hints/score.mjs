import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {normalize,score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';
const json=async name=>JSON.parse(await readFile(new URL(name,import.meta.url)));
const recipes=await json('recipes.json');
const {records:fixtures}=await json('manifest.json');
const {records,externalRequests}=await json('results.json');
assert.deepEqual(externalRequests,[]);
const groups={},observations=[],safety=[],controls=[],times={};
const counts=()=>({clips:0,words:0,wordErrors:0,anchors:0,misses:0,negationFlags:0});
const forms=noun=>['','ה','ב','ל','מ','ו','וה'].map(prefix=>prefix+noun);
function nouns(text,recipe){
  const words=new Set(normalize(text).split(' '));
  return recipes[recipe].filter(noun=>forms(noun).some(form=>words.has(form)));
}
const byKey=new Map(records.map(r=>[r.filename+'/'+r.arm,r]));
assert.equal(fixtures.length,32);assert.equal(records.length,128);assert.equal(byKey.size,128);
for(const f of fixtures){
  const control=byKey.get(f.filename+'/beam4');
  for(const arm of ['greedy','beam4','hints-salad','hints-cookies']){
    const row=byKey.get(f.filename+'/'+arm);
    const metrics=score(f.reference,row.text);
    assert.equal(row.pcm_sha256,f.pcm_sha256);assert.deepEqual(row.metrics,metrics);
    if(!f.recipe){controls.push({id:f.filename,arm,text:row.text});continue;}
    const context=arm.startsWith('hints-')?arm.slice(6):null;
    const group=context?(context===f.recipe?'matching':'swapped'):arm;
    const g=groups[group]??=counts();
    // s3's reference itself contains the conjunction-prefixed variant.
    const anchors=f.anchors.map(term=>f.id==='s3' && term==='עוד לא' ? 'עוד לא|ועוד לא' : term);
    const lost=missing(row.text,anchors);
    assert.deepEqual(missing(f.reference,anchors),[]);
    g.clips++;g.words+=metrics.referenceWords;g.wordErrors+=metrics.wordErrors;
    g.anchors+=f.anchors.length;g.misses+=lost.length;
    g.negationFlags+=Number(metrics.negationCountDelta!==0);
    (times[group]??=[]).push(row.ms);
    if(context){
      const newHintedNouns=nouns(row.text,context).filter(n=>!nouns(f.reference,context).includes(n)&&!nouns(control.text,context).includes(n));
      const newNegationFlag=metrics.negationCountDelta!==0 && control.metrics.negationCountDelta===0;
      if(newHintedNouns.length||newNegationFlag)safety.push({id:f.filename,group,newHintedNouns,newNegationFlag,reference:f.reference,beam4:control.text,hinted:row.text});
      if(normalize(row.text)!==normalize(control.text))observations.push({id:f.filename,group,reference:f.reference,beam4:control.text,hinted:row.text,lost});
    }
  }
}
for(const [key,x] of Object.entries(times))groups[key].medianDecodeMs=x.sort((a,b)=>a-b)[Math.ceil(x.length/2)-1];
const {matching,greedy,beam4}=groups;
const gate=matching.wordErrors<greedy.wordErrors && matching.misses<greedy.misses && matching.misses<beam4.misses &&
  safety.length===0 && controls.every(r=>!r.text.trim());
const report={groups,gate,safety,controls,observations};
if(process.argv.includes('--verify'))assert.deepEqual(await json('summary.json'),report);
else await writeFile(new URL('summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({groups,gate,safety,nonemptyControls:controls.filter(r=>r.text.trim()).length},null,2));

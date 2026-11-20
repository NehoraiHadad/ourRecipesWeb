// Pure re-scoring of the frozen real WASM run. No new inference or tuning.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {score} from '../metrics.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const json=async name=>JSON.parse(await readFile(path.join(ROOT,name),'utf8'));
const protocol=await json('evidence/browser-protocol.json');
for(const [name,sha] of Object.entries(protocol.sourceSha256))assert.equal(createHash('sha256').update(await readFile(path.join(ROOT,name))).digest('hex'),sha);
const input=await json('evidence/input-reconstruction.json');
const run=await json('evidence/browser-full.json');
assert.equal(run.completed,true);assert.equal(run.smoke,false);assert.equal(run.records.length,340);
assert.deepEqual(run.externalRequests,[]);
const native={};for(const arm of protocol.arms)native[arm]=await json(`evidence/${arm}.json`);
const quantile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(p*values.length)-1)];
const groups={},rows={},parity={};
for(const arm of protocol.arms){
 const records=run.records.filter(r=>r.arm===arm);assert.equal(records.length,170);
 rows[arm]=records.map((r,i)=>{
  const fixture=input.records[i];assert.equal(r.id,fixture.id);assert.equal(r.inputSha256,fixture.sha256);
  assert.ok(Number.isFinite(r.ms)&&r.ms>0);
  return {...fixture,...r,evaluation:score(fixture.reference,r.text,fixture.probes)};
 });
 groups[arm]={};
 for(const group of [...new Set(rows[arm].map(r=>r.source+'/'+r.condition))]){
  const subset=rows[arm].filter(r=>r.source+'/'+r.condition===group),sum=k=>subset.reduce((s,r)=>s+r.evaluation[k],0),words=sum('referenceWords');
  groups[arm][group]={cases:subset.length,wordErrors:sum('wordErrors'),referenceWords:words,wer:words?sum('wordErrors')/words:null,
   characterErrors:sum('characterErrors'),exact:subset.filter(r=>r.evaluation.exact).length,
   markerWarnings:subset.filter(r=>r.evaluation.markerWarning).length,negationWarnings:subset.filter(r=>r.evaluation.negationCountDelta!==0).length,
   medianMs:quantile(subset.map(r=>r.ms),.5),p95Ms:quantile(subset.map(r=>r.ms),.95),medianRtf:quantile(subset.map(r=>r.ms/1000/r.audioSeconds),.5)};
 }
 parity[arm]={exact:records.filter((r,i)=>r.text===native[arm].records[i].text).length,total:170,
  differences:records.filter((r,i)=>r.text!==native[arm].records[i].text).map(r=>({id:r.id,browser:r.text,native:native[arm].records.find(n=>n.id===r.id).text}))};
}
const changed=rows.greedy.map((a,i)=>{
 const b=rows.beam4[i];return {id:a.id,source:a.source,condition:a.condition,reference:a.reference,greedy:a.text,beam4:b.text,
  wordErrorDelta:b.evaluation.wordErrors-a.evaluation.wordErrors,characterErrorDelta:b.evaluation.characterErrors-a.evaluation.characterErrors,
  greedyMarkerWarning:a.evaluation.markerWarning,beamMarkerWarning:b.evaluation.markerWarning};
}).filter(r=>r.greedy!==r.beam4);
const memory={};for(const phase of [...new Set(run.memory.map(r=>r.phase))]){
 const sample=run.memory.filter(r=>r.phase===phase);memory[phase]={samples:sample.length,peakPssMiB:Math.max(...sample.map(r=>r.pssMiB)),peakRssMiB:Math.max(...sample.map(r=>r.sumRssMiB))};
}
const markerGuard=['public-human/clean','public-human/white-noise-20dB','synthetic-loopback/clean','synthetic-loopback/white-noise-20dB'].every(k=>groups.beam4[k].markerWarnings<=groups.greedy[k].markerWarnings&&groups.beam4[k].negationWarnings<=groups.greedy[k].negationWarnings);
const controls=['negative-control/silence','negative-control/noise'].every(k=>groups.beam4[k].exact===groups.beam4[k].cases);
const result={scope:'Actual Chromium CPU WASM: two arms, same new runtime and byte-identical inputs. New backend versus old app worker is a separate variable; no claim that decoder alone reproduces old browser baseline.',
 groups,exactNativeParity:parity,loads:run.loads,memory,changedCount:changed.length,
 changedByWordErrors:{better:changed.filter(r=>r.wordErrorDelta<0).length,worse:changed.filter(r=>r.wordErrorDelta>0).length,equal:changed.filter(r=>r.wordErrorDelta===0).length},changed,
 decision:{lowerPublicHumanWordErrors:groups.beam4['public-human/clean'].wordErrors<groups.greedy['public-human/clean'].wordErrors,
 noAdditionalMarkerWarningsCleanAnd20dB:markerGuard,noWordsOnNegativeControls:controls,browserTested:true,physicalPhoneTested:false,productPromotion:false},
 limitations:['Exposed development corpus: 12 public transcript IDs, not 12 verified speakers; no real kitchen speech.',
 'Decode timing excludes capture, endpoint wait, fixture transfer, hash check and physical playback; adds same 1.5-second quiet tail computationally without waiting 1.5 seconds.',
 'Load timing includes local fixture transfer/FS; not real internet download. No cold-cache repetitions.',
 'Memory is whole Chrome process tree, 1-second sampling, sequential greedy then beam4; retained caches/processes can affect arm comparison.',
 'Wrapper does not expose temperatureScale; not overridden. Browser-versus-native text parity is measured separately.',
 'Word/marker scores do not establish V52 recipe state accuracy, perceptual voice quality or phone support.']};
const target=path.join(ROOT,'evidence/browser-comparison.json');
if(process.argv.includes('--verify-only'))assert.deepEqual(await json('evidence/browser-comparison.json'),result);
else await writeFile(target,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({groups,parity:Object.fromEntries(Object.entries(parity).map(([k,v])=>[k,{exact:v.exact,total:v.total}])),decision:result.decision,changes:result.changedByWordErrors,memory},null,2));

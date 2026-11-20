// Re-score all outputs, with no inference and no changes to the reference text.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {score} from '../metrics.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const input=await json(path.join(ROOT,'evidence/input-reconstruction.json'));
const nativeOld=await json(path.join(ROOT,'../evidence/native-reference.json'));
const baseline=await json(path.join(ROOT,'../evidence/browser-results.json'));
const arms={};for(const name of ['greedy','beam4'])arms[name]=await json(path.join(ROOT,`evidence/${name}.json`));
const q=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a[Math.max(0,Math.ceil(p*a.length)-1)];};
const stats=(rows)=>{
 const sum=k=>rows.reduce((s,r)=>s+r.evaluation[k],0),words=sum('referenceWords');
 return {cases:rows.length,wordErrors:sum('wordErrors'),referenceWords:words,wer:words?sum('wordErrors')/words:null,
  characterErrors:sum('characterErrors'),exact:rows.filter(r=>r.evaluation.exact).length,
  negationWarnings:rows.filter(r=>r.evaluation.negationCountDelta!==0).length,markerWarnings:rows.filter(r=>r.evaluation.markerWarning).length,
  medianMs:q(rows.map(r=>r.ms),.5),p95Ms:q(rows.map(r=>r.ms),.95),medianRtf:q(rows.map(r=>r.ms/1000/r.audioSeconds),.5)};
};
const all={};
for(const name of ['browser','greedy','beam4']){
 const source=name==='browser'?baseline.asr:arms[name].records;
 assert.equal(source.length,170);if(name!=='browser')assert.equal(arms[name].completed,true);
 all[name]=source.map((r,i)=>{const row=input.records[i];assert.equal(r.id,row.id);if(name!=='browser')assert.equal(r.inputSha256,row.sha256);
  return {...row,...r,evaluation:score(row.reference,r.text,row.probes)};});
}
const groups={};
for(const name of Object.keys(all)){
 groups[name]={};
 for(const source of ['public-human','synthetic-loopback','negative-control'])for(const condition of [...new Set(all[name].filter(r=>r.source===source).map(r=>r.condition))]){
  groups[name][source+'/'+condition]=stats(all[name].filter(r=>r.source===source&&r.condition===condition));
 }
}
const reproduction=nativeOld.records.map(r=>({id:r.id,match:all.greedy.find(n=>n.id===r.id).text===r.text}));
assert.equal(reproduction.filter(r=>r.match).length,12,'Native control changed');
const transitions=all.greedy.map((r,i)=>({id:r.id,source:r.source,condition:r.condition,reference:r.reference,greedy:r.text,beam4:all.beam4[i].text,
 wordErrorDelta:all.beam4[i].evaluation.wordErrors-r.evaluation.wordErrors,greedyMarkerWarning:r.evaluation.markerWarning,beamMarkerWarning:all.beam4[i].evaluation.markerWarning})).filter(r=>r.greedy!==r.beam4);
const c=groups.greedy,d=groups.beam4;
const markerGuard=['public-human/clean','public-human/white-noise-20dB','synthetic-loopback/clean','synthetic-loopback/white-noise-20dB'].every(k=>d[k].markerWarnings<=c[k].markerWarnings&&d[k].negationWarnings<=c[k].negationWarnings);
const quietGuard=['negative-control/silence','negative-control/noise'].every(k=>d[k].exact===d[k].cases);
const decision={lowerPublicHumanWordErrors:d['public-human/clean'].wordErrors<c['public-human/clean'].wordErrors,
 noAdditionalMarkerWarningsCleanAnd20dB:markerGuard,noWordsOnNegativeControls:quietGuard,
 nativeResearchContinuationGate:d['public-human/clean'].wordErrors<c['public-human/clean'].wordErrors&&markerGuard&&quietGuard,
 browserBeamTested:false,physicalPhoneTested:false,productPromotion:false};
const result={scope:'Two actual native CPU decoders on170 byte-identical exposed audio inputs. No training, new model or text repair. Comparison with previously measured browser shown separately; timing domains differ.',
 groups,decision,reproducedNativeControl:reproduction,load: Object.fromEntries(Object.entries(arms).map(([k,v])=>[k,{loadSeconds:v.loadSeconds,peakNativeProcessRssKiB:v.peakNativeProcessRssKiB,settings:v.settings}])),
 changedOutputs:transitions,changedCount:transitions.length,
 interpretation:'Development evidence, not unseen quality. Marker warnings do not score full recipe state or perceptual TTS. A lower total may include individual regressions.'};
const target=path.join(ROOT,'evidence/comparison.json');
if(process.argv.includes('--verify-only'))assert.deepEqual(await json(target),result);
else await writeFile(target,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({groups,decision,changedOutputs:transitions.length},null,2));

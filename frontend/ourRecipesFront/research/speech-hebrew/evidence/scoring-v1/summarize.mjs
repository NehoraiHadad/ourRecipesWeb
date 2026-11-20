// Recompute scores from saved transcripts; no new inference or network.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { score } from './metrics.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const OUT=path.resolve(process.argv[2]||path.join(ROOT,'runs/full-v2-20261120'));
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const quantile=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a[Math.max(0,Math.ceil(p*a.length)-1)]??null;};
const report=await json(path.join(OUT,'results.json'));
assert.equal(report.completed,true);assert.equal(report.smoke,false);
assert.equal(report.tts.length,48);assert.equal(report.asr.length,170);
assert.equal(report.externalRequests.length,0);
const cases=await json(path.join(ROOT,'cases.json'));
for(const row of report.tts){assert.equal(row.type,'result');assert.ok(row.samples>0&&row.audioSeconds>0);const raw=await readFile(path.join(OUT,row.wav.file));assert.equal(sha(raw),row.wav.sha256);assert.equal(raw.length,row.wav.bytes);}
const groups={};
for(const row of report.asr){
  assert.equal(row.type,'result');
  const probes=cases.find(c=>row.source==='synthetic-loopback'&&row.id.startsWith(`${row.engine}-${row.voice}-${c.id}-`))?.probes||[];
  assert.deepEqual(score(row.reference,row.text,probes),row.evaluation);
  const name=[row.source,row.voice||'',row.condition].filter(Boolean).join('/');(groups[name]||=[]).push(row);
}
const asr={};
for(const [name,rows] of Object.entries(groups)){
  const sum=key=>rows.reduce((s,r)=>s+r.evaluation[key],0),words=sum('referenceWords'),chars=sum('referenceCharacters');
  asr[name]={cases:rows.length,wordErrors:sum('wordErrors'),referenceWords:words,wer:words?sum('wordErrors')/words:null,
    characterErrors:sum('characterErrors'),referenceCharacters:chars,cer:chars?sum('characterErrors')/chars:null,
    exact:rows.filter(r=>r.evaluation.exact).length,negationCountWarnings:rows.filter(r=>r.evaluation.negationCountDelta!==0).length,
    markerWarnings:rows.filter(r=>r.evaluation.markerWarning).length,medianMs:quantile(rows.map(r=>r.ms),.5),p95Ms:quantile(rows.map(r=>r.ms),.95),
    medianRtf:quantile(rows.map(r=>r.ms/1000/r.audioSeconds),.5)};
}
const tts={};
for(const voice of ['omer','liat','noa']){
  const rows=report.tts.filter(r=>r.voice===voice);assert.equal(rows.length,16);
  tts[voice]={cases:rows.length,medianGenerationMs:quantile(rows.map(r=>r.ms),.5),p95GenerationMs:quantile(rows.map(r=>r.ms),.95),
    medianFirstPcmMs:quantile(rows.map(r=>r.firstAudioMs),.5),p95FirstPcmMs:quantile(rows.map(r=>r.firstAudioMs),.95),
    medianFirstNonzeroMs:quantile(rows.map(r=>r.firstNonzeroMs),.5),medianRtf:quantile(rows.map(r=>r.ms/1000/r.audioSeconds),.5),
    p95Rtf:quantile(rows.map(r=>r.ms/1000/r.audioSeconds),.95),medianG2pMs:quantile(rows.map(r=>r.g2pMs),.5)};
}
const native=await json(path.join(ROOT,'evidence/native-reference.json'));
const paired=report.asr.filter(r=>r.source==='public-human'&&r.condition==='clean').map(r=>{
  const n=native.records.find(n=>n.id===r.id);assert.equal(r.pcmSha256,n.inputPcmSha256);
  return {id:r.id,reference:r.reference,browser:r.text,native:n.text,rawExact:r.text===n.text,normalizedExact:score(n.text,r.text).exact,
    browserWordErrors:r.evaluation.wordErrors,nativeWordErrors:score(r.reference,n.text).wordErrors};
});
const memory={};
for(const phase of [...new Set(report.memory.map(r=>r.phase))]){
  const rows=report.memory.filter(r=>r.phase===phase);memory[phase]={samples:rows.length,peakRssMiB:Math.max(...rows.map(r=>r.sumRssMiB)),peakPssMiB:Math.max(...rows.map(r=>r.pssMiB||0))};
}
const warnings=report.asr.filter(r=>r.source==='synthetic-loopback'&&r.evaluation.markerWarning).map(r=>({id:r.id,condition:r.condition,voice:r.voice,reference:r.reference,text:r.text,negationCountDelta:r.evaluation.negationCountDelta,markerChecks:r.evaluation.markerChecks}));
const result={scope:report.scope,completedUtc:report.completedUtc,browser:report.browser,host:report.host,load:report.load,asr,tts,memory,memoryScope:report.memoryScope,
  nativeComparison:{cases:paired.length,rawExact:paired.filter(r=>r.rawExact).length,normalizedExact:paired.filter(r=>r.normalizedExact).length,
    browserWordErrors:paired.reduce((s,r)=>s+r.browserWordErrors,0),nativeWordErrors:paired.reduce((s,r)=>s+r.nativeWordErrors,0),pairs:paired},
  markerWarnings:warnings,externalRequests:report.externalRequests,validatedTtsWavs:48,validatedAsrOutputs:170,
  extraProbeScope:'Full run also makes2 unscored TTS calls during combined residency checks. Prior smoke generated3 other WAVs. Neither is part of the48 quality comparisons.',
  interpretation:'Read-speech diagnostic and synthetic loopback, not representative kitchen/user/phone quality. Marker checks do not score V52 state correctness or perceptual speech quality.'};
await writeFile(path.join(ROOT,'evidence/summary.json'),JSON.stringify(result,null,2),{flag:'wx'});
await writeFile(path.join(ROOT,'evidence/browser-results.json'),JSON.stringify(report,null,2),{flag:'wx'});
await writeFile(path.join(ROOT,'evidence/run-provenance.json'),await readFile(path.join(OUT,'provenance.json')),{flag:'wx'});
console.log(JSON.stringify({asr,tts,nativeComparison:{rawExact:result.nativeComparison.rawExact,normalizedExact:result.nativeComparison.normalizedExact,browserWordErrors:result.nativeComparison.browserWordErrors,nativeWordErrors:result.nativeComparison.nativeWordErrors},warnings:warnings.length,external:report.externalRequests.length},null,2));

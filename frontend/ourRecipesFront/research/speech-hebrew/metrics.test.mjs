import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, score, noise, phonemeIds } from './metrics.mjs';
test('normalization removes nikud and punctuation without deleting negation or merging maqaf words',()=>{
  assert.equal(normalize('עוֹד־לֹא הוֹסַפְתִּי מַיִם!'),'עוד לא הוספתי מים');
  assert.equal(score('לא הוספתי מים','הוספתי מים').negationCountDelta,-1);
  assert.equal(score('הוספתי מים','לא הוספתי מים').negationCountDelta,1);
});
test('word edits handle insertions deletions substitutions and empty recognition',()=>{
  assert.equal(score('להוסיף מים','להוסיף מים ולערבב').wordErrors,1);
  assert.equal(score('להוסיף מים','להוסיף שמן').wordErrors,1);
  assert.equal(score('להוסיף מים','').wordErrors,2);
  assert.equal(score('להוסיף מים','להוסיף מים').wordErrors,0);
});
test('marker checks accept authored quantity aliases without forgiving lost uncertainty',()=>{
  const probes=[{name:'maybe',forms:['אולי']},{name:'two',forms:['שתי','2']}];
  assert.equal(score('אולי הוספתי שתי כפות','אולי הוספתי 2 כפות',probes).markerWarning,false);
  assert.equal(score('אולי הוספתי שתי כפות','הוספתי 2 כפות',probes).markerWarning,true);
});
test('noise meets measured SNR, is reproducible, finite and bounded',()=>{
  const pcm=Float32Array.from({length:16000},(_,i)=>.2*Math.sin(i*.2));
  const a=noise(pcm,20,42),b=noise(pcm,20,42);assert.deepEqual(a.pcm,b.pcm);
  const signal=pcm.reduce((s,x)=>s+(x*a.attenuation)**2,0);
  const delta=a.pcm.reduce((s,x,i)=>s+(x-pcm[i]*a.attenuation)**2,0);
  assert.ok(Math.abs(10*Math.log10(signal/delta)-20)<.001);
  assert.ok(a.pcm.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
  assert.throws(()=>noise(new Float32Array(10),20));
});
test('unknown phonemes fail instead of silently removing part of a spoken instruction',()=>{
  const map={'^':[1],'_':[0],'$':[2],'a':[3]};
  assert.throws(()=>phonemeIds('a?',map),/Unmapped phoneme/);
  assert.ok(phonemeIds('a',map).every(Number.isInteger));
});

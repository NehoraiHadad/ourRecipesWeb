// Recompute both sets of metrics from raw transcripts and exact input hashes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url)));
const cases=(await read('manifest.json')).records;
const report={};
const quantile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1];
for(const name of ['zipformer','whisper','whisper-he']){
  const {records,loads,browser,externalRequests}=await read(name+'.json');
  assert.equal(records.length,62);assert.equal(cases.length,62);
  assert.deepEqual(externalRequests,[]);
  const groups={};
  for(const group of ['plain','fan-room','human','control']){
    const counts={clips:0,wordErrors:0,words:0,missingAnchors:0,anchors:0,negationFlags:0,nonempty:0};
    const times=[];
    for(const [i,c] of cases.entries()){
      if(c.group!==group)continue;
      const r=records[i];assert.equal(r.filename,c.filename);assert.equal(r.pcm_sha256,c.pcm_sha256);
      const metrics=score(c.reference,r.text);
      assert.deepEqual(metrics,r.metrics);
      counts.clips++;counts.wordErrors+=metrics.wordErrors;counts.words+=metrics.referenceWords;
      counts.missingAnchors+=missing(r.text,c.anchors||[]).length;counts.anchors+=(c.anchors||[]).length;
      counts.negationFlags+=Number(metrics.negationCountDelta!==0);
      counts.nonempty+=Number(r.text.trim()!=='');times.push(r.ms);
    }
    groups[group]={...counts,medianMs:quantile(times,.5),p95Ms:quantile(times,.95)};
  }
  report[name]={browser,loads,groups};
}
if(process.argv.includes('--verify'))assert.deepEqual(await read('summary.json'),report);
else await writeFile(new URL('summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));

// Recompute every score from transcripts and retain the cross-check's paired deltas.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {score} from '../../metrics.mjs';
import {missing} from './anchors.mjs';
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const summary={};
for(const [suite,count] of [['extras',72],['human',104]]){
 const manifest=await read(suite+'-manifest.json'),results=await read(suite+'-results.json');
 assert.deepEqual(results.externalRequests,[]);assert.equal(manifest.records.length,count);
 const byId=new Map(results.records.map(row=>[row.filename,row]));assert.equal(byId.size,count);assert.equal(results.records.length,count);
 const groups={};
 for(const row of manifest.records){
  const prediction=byId.get(row.filename);
  assert.equal(prediction.arm,'greedy');assert.equal(prediction.pcm_sha256,row.pcm_sha256);
  const metrics=score(row.reference,prediction.text);assert.deepEqual(metrics,prediction.metrics);
  const key=row.style??row.filter;
  const group=groups[key]??={clips:0,wordErrors:0,words:0,negationFlags:0};
  group.clips++;group.wordErrors+=metrics.wordErrors;group.words+=metrics.referenceWords;
  group.negationFlags+=Number(metrics.negationCountDelta!==0);
  if(row.anchors){
    assert.equal(missing(row.reference,row.anchors).length,0);
    group.anchorsMissed=(group.anchorsMissed??0)+missing(prediction.text,row.anchors).length;
    group.anchors=(group.anchors??0)+row.anchors.length;
  }
 }
 summary[suite]=groups;
 if(suite==='human'){
  const previous=await read('../fresh/results.json');
  const priorBySha=new Map(previous.records.filter(r=>r.arm==='greedy').map(r=>[r.pcm_sha256,r.text]));
  const raw=manifest.records.filter(r=>r.filter==='raw');
  summary.humanControlMatchesPrevious=raw.filter(row=>priorBySha.get(row.pcm_sha256)===byId.get(row.filename).text).length;
  const changes=raw.map(row=>byId.get(row.filename.replace(/-raw$/,'-highpass140')).metrics.wordErrors-byId.get(row.filename).metrics.wordErrors);
  summary.humanPairedClips={better:changes.filter(n=>n<0).length,worse:changes.filter(n=>n>0).length,same:changes.filter(n=>n===0).length};
 }
}
if(process.argv.includes('--verify'))assert.deepEqual(summary,await read('cross-check.json'));
else await writeFile(new URL('cross-check.json',import.meta.url),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));

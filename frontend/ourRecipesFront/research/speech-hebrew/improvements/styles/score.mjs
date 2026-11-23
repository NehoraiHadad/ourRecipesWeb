// Count ordered, whole-token anchors. An absent anchor does not discard later matches.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {normalize,score} from '../../metrics.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const manifest=await read('manifest.json'), result=await read('results.json');
const cases=await read('cases.json');
const byId=new Map(result.records.map(row=>[row.filename,row]));
assert.equal(byId.size,360);assert.equal(result.records.length,360);assert.equal(manifest.records.length,360);
assert.deepEqual(result.externalRequests,[]);
function missing(text,anchors){
  const words=normalize(text).split(' ');
  let next=0; const lost=[];
  for(const anchor of anchors){
    const options=anchor.split('|').map(term=>normalize(term).split(' '));
    let found=false;
    for(let i=next;i<words.length&&!found;i++){
      const match=options.find(option=>option.every((w,j)=>words[i+j]===w));
      if(match){next=i+match.length;found=true;}
    }
    if(!found)lost.push(anchor);
  }
  return lost;
}
const groups={}, slots=new Set(), changed=[];
for(const row of manifest.records){
  const record=byId.get(row.filename), prompt=cases.find(c=>c.id===row.prompt);
  const slot=[row.voice,row.prompt,row.style,row.filter].join('/');
  assert(!slots.has(slot));slots.add(slot);
  assert.equal(record.arm,'greedy'); assert.equal(row.pcm_sha256,record.pcm_sha256);
  assert.equal(row.reference,prompt.text);assert.deepEqual(row.anchors,prompt.anchors);
  const metrics=score(row.reference,record.text);assert.deepEqual(metrics,record.metrics);
  assert.equal(missing(row.reference,row.anchors).length,0);
  const lost=missing(record.text,row.anchors);
  for(const category of [row.style,'all']){
    const key=category+'/'+row.filter;
    const group=groups[key]??={clips:0,wordErrors:0,words:0,anchorsMissed:0,anchors:0,negationFlags:0,allAnchorsPreserved:0};
    group.clips++;group.wordErrors+=metrics.wordErrors;group.words+=metrics.referenceWords;
    group.anchorsMissed+=lost.length;group.anchors+=row.anchors.length;
    group.negationFlags+=Number(metrics.negationCountDelta!==0);group.allAnchorsPreserved+=Number(!lost.length);
  }
  if(row.filter==='highpass140'){
    const raw=byId.get(row.filename.replace(/-highpass140$/,'-raw'));
    if(raw.text!==record.text)changed.push({key:slot,reference:row.reference,raw:raw.text,filtered:record.text,
      rawMissing:missing(raw.text,row.anchors),filteredMissing:lost,wordErrorDelta:metrics.wordErrors-raw.metrics.wordErrors});
  }
}
const pair=key=>[groups[key+'/raw'],groups[key+'/highpass140']];
const [rumbleRaw,rumbleFiltered]=pair('fan-room'),[cleanRaw,cleanFiltered]=pair('plain'),[allRaw,allFiltered]=pair('all');
const passes=rumbleFiltered.wordErrors<rumbleRaw.wordErrors && rumbleFiltered.anchorsMissed<rumbleRaw.anchorsMissed &&
  cleanFiltered.wordErrors<=cleanRaw.wordErrors && cleanFiltered.anchorsMissed<=cleanRaw.anchorsMissed &&
  allFiltered.negationFlags<=allRaw.negationFlags;
const summary={groups,passes,changed};
if(process.argv.includes('--verify'))assert.deepEqual(summary,await read('summary.json'));
else await writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({groups,passes}));

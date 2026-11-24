import {suspect,reconcile} from './retry.mjs';

const rate=16000;
const words = text => Array.from(text.matchAll(/[\p{L}\p{N}]+/gu));
export function actionWindows(text,timing,verbs,samples,otherVerbs=[]) {
  const {tokens,timestamps}=timing;
  if(!Array.isArray(tokens) || !Array.isArray(timestamps) || tokens.length!==timestamps.length) return [];
  const at=[];
  for(let i=0;i<tokens.length;i++){
    if(typeof tokens[i]!=='string' || !Number.isFinite(timestamps[i]) || timestamps[i]<0 ||
        (i && timestamps[i]<timestamps[i-1])) return [];
    for(let j=0;j<tokens[i].length;j++) at.push(timestamps[i]);
  }
  const spans=words(tokens.join('')),current=words(text);
  if(spans.length!==current.length) return [];
  const windows=[];
  for(const s of suspect(text,verbs,otherVerbs)) {
    // Other single-word edits from the full pass cannot change this local alignment.
    const left=Math.max(0,s.i-2), right=Math.min(spans.length-1,s.i+1);
    if(spans.slice(left,right+1).some((m,k)=>m[0]!==current[left+k][0])) continue;
    const start=Math.floor(Math.max(0,at[spans[left].index]-.32)*rate);
    const next=spans[s.i+2];
    const end=next ? Math.min(samples,Math.ceil((at[next.index]+.32)*rate)) : samples;
    if(end>start && (start>0 || end<samples)) windows.push({index:s.i,start,end});
  }
  return windows;
}

// Apply edits in reverse index order so a changed word length preserves earlier offsets.
export async function checkWindows(text,timing,verbs,pcm,decode,otherVerbs=[]) {
  let result=text;
  for(const window of actionWindows(text,timing,verbs,pcm.length,otherVerbs).reverse()) {
    const alternative=await decode(pcm.subarray(window.start,window.end));
    const edit=reconcile(text,alternative,verbs,otherVerbs).edits.find(e=>e.i===window.index);
    if(edit) result=result.slice(0,edit.offset)+edit.to+result.slice(edit.offset+edit.from.length);
  }
  return result;
}

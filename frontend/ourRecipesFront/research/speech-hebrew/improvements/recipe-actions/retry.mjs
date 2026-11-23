import {distance} from '../../metrics.mjs';

const negations = new Set(['לא','ולא','שלא','ושלא']);
function words(text) {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu),m=>({text:m[0],offset:m.index}));
}

// Match the same two left neighbors and one right neighbor, including boundaries.
function uniqueWindow(tokens,index,replacement,other) {
  const signature = (seq,i) => JSON.stringify([seq[i-2]?.text,seq[i-1]?.text,seq[i+1]?.text]);
  const wanted = signature(tokens,index);
  const matches = other.filter((_,i)=>signature(other,i)===wanted);
  return matches.length===1 && matches[0].text===replacement;
}
export function suspect(text,verbs) {
  const tokens = words(text);
  const found = [];
  for (const [i,t] of tokens.entries()) {
    if (!negations.has(tokens[i-1]?.text) || !t.text.endsWith('תי') || verbs.includes(t.text)) continue;
    const near = verbs.filter(v=>distance(t.text,v)<=2);
    if (near.length===1 && uniqueWindow(tokens,i,t.text,tokens)) {
      found.push({i,offset:t.offset,from:t.text,to:near[0]});
    }
  }
  return found;
}
export function reconcile(first,second,verbs) {
  const source = words(first), other = words(second);
  const edits = suspect(first,verbs).filter(s=>uniqueWindow(source,s.i,s.to,other));
  let text = first;
  for (const s of edits.slice().reverse()) {
    text = text.slice(0,s.offset)+s.to+text.slice(s.offset+s.from.length);
  }
  return {text,edits};
}

// Both callbacks decode the same local PCM and return transcript text. The second is lazy.
export async function transcribeWithActionCheck(pcm,verbs,decodeBase,decodeWithActionHints) {
  const first = await decodeBase(pcm);
  if (!suspect(first,verbs).length) return first;
  try {
    const second = await decodeWithActionHints(pcm);
    return reconcile(first,second,verbs).text;
  } catch {
    return first;
  }
}

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + Number(a[i] !== b[j])));
    previous = current;
  }
  return previous[b.length];
}

const negations = new Set(['לא','ולא','שלא','ושלא']);
function words(text) {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu),m=>({text:m[0],offset:m.index}));
}

// Match the same two left neighbors and one right neighbor, including boundaries.
function wordInUniqueWindow(tokens,index,other) {
  const signature = (seq,i) => JSON.stringify([seq[i-2]?.text,seq[i-1]?.text,seq[i+1]?.text]);
  const wanted = signature(tokens,index);
  const matches = other.filter((_,i)=>signature(other,i)===wanted);
  return matches.length===1 ? matches[0].text : undefined;
}
export function suspect(text,verbs,otherVerbs=[]) {
  const tokens = words(text);
  const found = [];
  for (const [i,t] of tokens.entries()) {
    if (!negations.has(tokens[i-1]?.text) || !t.text.endsWith('תי') || verbs.includes(t.text) || otherVerbs.includes(t.text)) continue;
    const near = verbs.filter(v=>distance(t.text,v)<=2);
    if (near.length===1 && wordInUniqueWindow(tokens,i,tokens)===t.text) {
      found.push({i,offset:t.offset,from:t.text,to:near[0]});
    }
  }
  return found;
}
export function reconcile(first,second,verbs,otherVerbs=[]) {
  const source = words(first), other = words(second);
  const edits = [];
  for (const candidate of suspect(first,verbs,otherVerbs)) {
    const heard = wordInUniqueWindow(source,candidate.i,other);
    if (heard===candidate.to || (otherVerbs.includes(heard) && distance(candidate.from,heard)<=2)) {
      edits.push({...candidate,to:heard});
    }
  }
  let text = first;
  for (const s of edits.slice().reverse()) {
    text = text.slice(0,s.offset)+s.to+text.slice(s.offset+s.from.length);
  }
  return {text,edits};
}

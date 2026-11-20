// Research diagnostics. Marker preservation does not prove semantic correctness.
export function normalize(text) {
  return text.normalize('NFD').toLowerCase()
    .replace(/[\u0591-\u05bd\u05bf-\u05c2\u05c4-\u05c5\u05c7]/g, '')
    .replace(/[^0-9a-z\u05d0-\u05ea]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + Number(a[i] !== b[j])));
    previous = current;
  }
  return previous[b.length];
}
export function score(reference, hypothesis, probes = []) {
  const ref = normalize(reference), hyp = normalize(hypothesis);
  const words = s => s ? s.split(' ') : [];
  const rw = words(ref), hw = words(hyp);
  const negations = ws => ws.filter(w => ['לא','ולא'].includes(w)).length;
  // Hebrew conjunction is attached to a word: וחצי retains חצי. No spelling,
  // numeric or semantic repair is applied to the transcript or WER/CER.
  const markerChecks = probes.map(p => ({ name: p.name, present: p.forms.some(form => {
    const normalized=normalize(form);
    return [` ${normalized} `,` ו${normalized} `].some(variant=>` ${hyp} `.includes(variant));
  }) }));
  return { normalizedReference: ref, normalizedHypothesis: hyp, exact: ref === hyp,
    wordErrors: distance(rw, hw), referenceWords: rw.length,
    characterErrors: distance([...ref.replaceAll(' ', '')], [...hyp.replaceAll(' ', '')]), referenceCharacters: ref.replaceAll(' ', '').length,
    negationCountDelta: negations(hw) - negations(rw), markerChecks,
    markerWarning: negations(hw) !== negations(rw) || markerChecks.some(p => !p.present) };
}
export function noise(pcm, snrDb, seed = 42) {
  if (!pcm.length || !pcm.every(Number.isFinite)) throw new Error('Invalid PCM');
  let state = seed >>> 0 || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) / 4294967296) * 2 - 1; };
  const values = Float32Array.from(pcm, random);
  const rms = a => Math.sqrt(a.reduce((sum, x) => sum + x*x, 0) / a.length);
  const signalRms = rms(pcm); if (!signalRms) throw new Error('SNR undefined for silence');
  const scale = signalRms / (rms(values) * 10 ** (snrDb / 20));
  let peak = 0;
  const mixed = Float32Array.from(pcm, (x, i) => { const result = x + values[i] * scale; peak = Math.max(peak, Math.abs(result)); return result; });
  const attenuation = peak > .99 ? .99 / peak : 1;
  if (attenuation < 1) for (let i = 0; i < mixed.length; i++) mixed[i] *= attenuation;
  return { pcm: mixed, requestedSnrDb: snrDb, attenuation, distribution: 'seeded uniform white noise; simulated, not kitchen recording', seed };
}
export function phonemeIds(phonemes, map) {
  const ids = [...map['^'], ...map['_']];
  for (const char of phonemes) {
    if (!Object.hasOwn(map, char)) throw new Error(`Unmapped phoneme U+${char.codePointAt(0).toString(16)}; refuse silent deletion`);
    ids.push(...map[char], ...map['_']);
  }
  ids.push(...map['$']); return ids;
}
export function wav(pcm, rate) {
  const bytes = Buffer.alloc(44 + pcm.length * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(rate,24); bytes.writeUInt32LE(rate*2,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34);
  bytes.write('data',36); bytes.writeUInt32LE(pcm.length*2,40);
  pcm.forEach((x,i) => bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1,x))*32767),44+2*i));
  return bytes;
}

import * as ort from './runtime/asr/ort.wasm.min.mjs';
import { logMel } from './features.js';
ort.env.wasm.wasmPaths = new URL('./runtime/asr/', self.location).href;
ort.env.wasm.numThreads = 1; // No COOP/COEP changes to the host application.
let sessions, config, symbols;
async function bytes(spec, path) {
  const cache = await caches.open(spec.cache);
  const hit = await cache.match(`${spec.base}${path}`);
  if (!hit) throw new Error('יש להוריד את מודל התמלול תחילה.');
  return new Uint8Array(await hit.arrayBuffer());
}
async function transcribe(pcm) {
  const start = performance.now();
  const padded = new Float32Array(pcm.length + 24000); padded.set(pcm);
  const features = logMel(padded);
  let states = config.states.map(s => new ort.Tensor(s.type, s.type === 'int64' ? new BigInt64Array(s.shape.reduce((a,b) => a*b,1)) : new Float32Array(s.shape.reduce((a,b) => a*b,1)), s.shape));
  const context = [-1, config.blank_id], ids = [];
  let decoder = (await sessions.decoder.run({ y: new ort.Tensor('int64', BigInt64Array.from(context, BigInt), [1, 2]) })).decoder_out;
  let chunks = 0;
  for (let offset = 0; (offset + config.T) * 80 <= features.length; offset += config.decode_chunk_len) {
    const feeds = { x: new ort.Tensor('float32', features.slice(offset * 80, (offset + config.T) * 80), [1, config.T, 80]) };
    config.states.forEach((s,i) => { feeds[s.name] = states[i]; });
    const output = await sessions.encoder.run(feeds);
    states = config.states.map(s => output[`new_${s.name}`]);
    const enc = output.encoder_out, dim = enc.dims[2];
    for (let t = 0; t < enc.dims[1]; t++) {
      const result = await sessions.joiner.run({
        encoder_out: new ort.Tensor('float32', enc.data.slice(t * dim, (t + 1) * dim), [1, dim]),
        decoder_out: new ort.Tensor('float32', decoder.data, [1, decoder.data.length]),
      });
      let token = 0;
      for (let k = 1; k < result.logit.data.length; k++) if (result.logit.data[k] > result.logit.data[token]) token = k;
      if (token !== config.blank_id && token !== config.unk_id) {
        ids.push(token); context.shift(); context.push(token);
        decoder = (await sessions.decoder.run({ y: new ort.Tensor('int64', BigInt64Array.from(context, BigInt), [1, 2]) })).decoder_out;
      }
    }
    chunks++;
  }
  return { text: ids.map(id => symbols[id] || '').join('').replace(/▁/g, ' ').trim(), ms: performance.now() - start, audioSeconds: pcm.length / 16000, chunks };
}
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === 'load') {
      const start = performance.now();
      config = JSON.parse(new TextDecoder().decode(await bytes(data.spec, 'onnx/config.json')));
      symbols = [];
      for (const line of new TextDecoder().decode(await bytes(data.spec, 'sherpa-onnx/tokens.txt')).split('\n')) {
        const match = line.match(/^(.*) (\d+)$/); if (match) symbols[+match[2]] = match[1];
      }
      sessions = {};
      for (const name of ['encoder', 'decoder', 'joiner']) sessions[name] = await ort.InferenceSession.create(await bytes(data.spec, `sherpa-onnx/${name}.int8.onnx`), { executionProviders: ['wasm'] });
      self.postMessage({ type: 'ready', ms: performance.now() - start });
    } else if (data.type === 'transcribe') self.postMessage({ type: 'result', ...await transcribe(data.pcm) });
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); }
  finally { busy = false; }
};

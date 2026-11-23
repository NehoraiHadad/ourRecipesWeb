// One request at a time. Only verified local assets are used during synthesis.
import * as ort from './vendor/ort.wasm.min.mjs';
import { HebrewG2P } from './vendor/g2p.js';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./vendor/', self.location.href).href;
let g2p, model, config;
async function load() {
  const cache = await caches.open('recipe-noa-v1');
  async function asset(name) {
    const response = await cache.match(new URL(name, self.location.href));
    if (!response) throw Error('חלק מקובצי הקול חסרים. מחקו את הקול והורידו אותו שוב.');
    return response;
  }
  config = await (await asset('he_IL-noa-medium.onnx.json')).json();
  g2p = await HebrewG2P.create(await (await asset('renikud.onnx')).arrayBuffer());
  model = await ort.InferenceSession.create(await (await asset('he_IL-noa-medium.onnx')).arrayBuffer(), {executionProviders:['wasm']});
}
self.onmessage = async ({data}) => {
  try {
    if (!model) await load();
    const phonemes = await g2p.phonemize(data.text);
    const map = config.phoneme_id_map;
    const ids = [...map['^'], ...map['_']];
    for (const char of phonemes) {
      if (!Object.hasOwn(map, char)) throw Error('הקול אינו תומך באחד הסימנים בטקסט. אפשר לקרוא אותו במסך.');
      ids.push(...map[char], ...map['_']);
    }
    ids.push(...map['$']);
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids,BigInt), [1,ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
      scales: new ort.Tensor('float32', Float32Array.of(config.inference.noise_scale,config.inference.length_scale,config.inference.noise_w),[3])
    };
    if (model.inputNames.includes('sid')) feeds.sid = new ort.Tensor('int64', BigInt64Array.of(0n), [1]);
    const outputs = await model.run(feeds);
    const pcm = new Float32Array(outputs[model.outputNames[0]].data);
    if (!pcm.length || !pcm.every(Number.isFinite)) throw Error('יצירת הקול נכשלה.');
    self.postMessage({pcm, rate:config.audio.sample_rate}, [pcm.buffer]);
  } catch (error) {
    const message = error instanceof Error && /[א-ת]/.test(error.message) ? error.message : 'יצירת ההקראה נכשלה במכשיר הזה.';
    self.postMessage({error:message});
  }
};

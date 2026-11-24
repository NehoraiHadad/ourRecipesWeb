import { initASRModule, createOnlineRecognizer } from './vendor/index.js';
import { suspect, reconcile } from './retry.mjs';
import { checkWindows } from './window.mjs';

let runtime, recognizer, mode, verbs, otherVerbs;
const model = name => '/model/' + name;

function select(next) {
  if (mode === next) return;
  recognizer?.free();
  recognizer = null;
  mode = null;
  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: model('encoder.int8.onnx'), decoder: model('decoder.int8.onnx'), joiner: model('joiner.int8.onnx') },
      tokens: model('tokens.txt'), modelingUnit: 'bpe', bpeVocab: model('bpe.vocab'),
      numThreads: 1, provider: 'cpu', modelType: 'zipformer2', debug: 0
    },
    decodingMethod: 'modified_beam_search', maxActivePaths: 4, enableEndpoint: 0,
    hotwordsFile: next === 'plain' ? '' : model(next + '.txt'), hotwordsScore: 1.5
  };
  recognizer = createOnlineRecognizer(runtime, config);
  if (!recognizer.handle) throw Error('Recognizer unavailable');
  mode = next;
}

function decode(pcm) {
  const stream = recognizer.createStream();
  try {
    stream.acceptWaveform(16000, pcm);
    stream.acceptWaveform(16000, new Float32Array(24000));
    stream.inputFinished();
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    return recognizer.getResult(stream);
  } finally { stream.free(); }
}

async function load({ cacheName, hints, files }) {
  runtime = await initASRModule();
  runtime.FS_createPath('/', 'model', true, true);
  const cache = await caches.open(cacheName);
  for (const name of files) {
    const hit = await cache.match(new URL(name, self.location));
    if (!hit) throw Error('Missing verified asset');
    runtime.FS_createDataFile('/model', name, new Uint8Array(await hit.arrayBuffer()), true, false, false);
  }
  verbs = hints.verbs;
  otherVerbs = hints.otherVerbs;
  for (const [arm, lines] of Object.entries(hints.lists)) {
    if (lines.length) runtime.FS_createDataFile('/model', arm+'.txt', new TextEncoder().encode(lines.join('\n')+'\n'), true, false, false);
  }
  select(hints.lists.ingredients.length ? 'ingredients' : 'plain');
}

async function transcribe(pcm, base) {
  select(base);
  const first = decode(pcm);
  let text = first.text;
  for (const [arm, alternatives] of [['actions', []], ['alternatives', otherVerbs]]) {
    if (!suspect(text, verbs, otherVerbs).length) break;
    select(arm);
    text = reconcile(text, decode(pcm).text, verbs, alternatives).text;
    text = await checkWindows(text, first, verbs, pcm, async cut => decode(cut).text, alternatives);
  }
  return { text, uncertain: suspect(text, verbs, otherVerbs).length > 0 };
}
let base;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') {
      await load(data);
      base = mode;
      self.postMessage({ready:true});
    } else self.postMessage(await transcribe(data.pcm, base));
  } catch { self.postMessage({error:true}); }
};

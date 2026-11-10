import { PocketTTS, HebrewG2P, resolveOptions } from './runtime/tts/pocket.js';
import { normalizeHebrewSpeech } from './hebrew-speech.js';
let tts, g2p;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  const start = performance.now();
  try {
    if (data.type === 'load') {
      resolveOptions({ ortWasmUrl: new URL('./runtime/tts/', self.location).href, threads: 1 });
      const cache = await caches.open(data.spec.cache);
      const read = async path => {
        const response = await cache.match(data.spec.base + path);
        if (!response) throw new Error('יש להוריד את מודל ההקראה תחילה.');
        return response;
      };
      tts = await PocketTTS.create(await (await read('he/model.onnx')).arrayBuffer(), await (await read('he/assets.json')).json());
      g2p = await HebrewG2P.create(await (await read('he/renikud.onnx')).arrayBuffer());
      await tts.prepareVoice('omer', true);
      self.postMessage({ type: 'ready', ms: performance.now() - start, sampleRate: tts.sampleRate });
    } else if (data.type === 'speak') {
      const normalized = normalizeHebrewSpeech(data.text);
      const phonemes = await g2p.phonemize(normalized);
      let samples = 0, firstAudioMs = null;
      for await (const frame of tts.stream({ text: phonemes, voice: 'omer', phonemes: true, seed: 42 })) {
        if (firstAudioMs === null) firstAudioMs = performance.now() - start;
        samples += frame.length;
        self.postMessage({ type: 'audio', pcm: frame, sampleRate: tts.sampleRate }, [frame.buffer]);
      }
      self.postMessage({ type: 'result', ms: performance.now() - start, firstAudioMs, audioSeconds: samples / tts.sampleRate, normalized });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); }
  finally { busy = false; }
};

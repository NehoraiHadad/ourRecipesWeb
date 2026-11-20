import { PocketTTS, HebrewG2P, resolveOptions, ort } from '/speech/runtime.js';
import { normalizeHebrewSpeech } from '/voice/hebrew-speech.js';
import { phonemeIds } from '/speech/metrics.mjs';
let tts, g2p, config, kind;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return; busy = true;
  const started = performance.now();
  try {
    if (data.type === 'load') {
      kind = data.kind;
      resolveOptions({ ortWasmUrl: new URL('/voice/runtime/tts/', self.location).href, threads: 1 });
      const cache = await caches.open(data.cache);
      const read = async key => { const hit = await cache.match(new URL(key,self.location)); if (!hit) throw new Error('Missing explicit local fixture '+key); return hit; };
      g2p = await HebrewG2P.create(await (await read('/models/tts/he/renikud.onnx')).arrayBuffer());
      if (kind === 'pocket') {
        tts = await PocketTTS.create(await (await read('/models/tts/he/model.onnx')).arrayBuffer(), await (await read('/models/tts/he/assets.json')).json());
        await tts.prepareVoice('omer', true); await tts.prepareVoice('liat', true);
      } else {
        config = await (await read('/models/piper/he_IL-noa-medium.onnx.json')).json();
        if (config.phoneme_type !== 'hebrew') throw new Error('Unexpected G2P convention');
        tts = await ort.InferenceSession.create(await (await read('/models/piper/he_IL-noa-medium.onnx')).arrayBuffer(), { executionProviders: ['wasm'] });
      }
      self.postMessage({ type:'ready', kind, ms:performance.now()-started, inputNames:kind==='piper'?tts.inputNames:null });
    } else {
      const normalized = normalizeHebrewSpeech(data.text).replaceAll('־',' ');
      const phonemes = await g2p.phonemize(normalized);
      const g2pMs = performance.now()-started;
      let samples=0, firstAudioMs=null, firstNonzeroMs=null;
      const rate=kind==='pocket'?tts.sampleRate:config.audio.sample_rate;
      const emit=frame => { firstAudioMs ??= performance.now()-started; if (frame.some(x=>Math.abs(x)>1e-5)) firstNonzeroMs ??= performance.now()-started; samples+=frame.length; self.postMessage({type:'audio',pcm:frame,sampleRate:rate},[frame.buffer]); };
      if (kind==='pocket') {
        if (!['omer','liat'].includes(data.voice)) throw new Error('Only fixed Hebrew voices');
        for await (const frame of tts.stream({text:phonemes,voice:data.voice,phonemes:true,seed:42})) emit(frame);
      } else {
        const ids=phonemeIds(phonemes,config.phoneme_id_map);
        const feeds={input:new ort.Tensor('int64',BigInt64Array.from(ids,BigInt),[1,ids.length]),
          input_lengths:new ort.Tensor('int64',BigInt64Array.from([ids.length],BigInt),[1]),
          scales:new ort.Tensor('float32',Float32Array.from([config.inference.noise_scale,config.inference.length_scale,config.inference.noise_w]),[3])};
        if (tts.inputNames.includes('sid')) feeds.sid=new ort.Tensor('int64',BigInt64Array.from([0n]),[1]);
        const output=await tts.run(feeds); emit(new Float32Array(output[tts.outputNames[0]].data));
      }
      self.postMessage({type:'result',kind,voice:data.voice,ms:performance.now()-started,g2pMs,firstAudioMs,firstNonzeroMs,samples,sampleRate:rate,audioSeconds:samples/rate,normalized,phonemes});
    }
  } catch (error) { self.postMessage({type:'error',message:String(error?.stack || error)}); }
  finally { busy=false; }
};

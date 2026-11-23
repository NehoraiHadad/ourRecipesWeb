import {initASRModule, OfflineRecognizer} from '/pkg/index.js';
let module, recognizer;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') {
      const start = performance.now();
      module = await initASRModule();
      module.FS_createPath('/', 'model', true, true);
      for (const name of ['tiny-encoder.int8.onnx','tiny-decoder.int8.onnx','tiny-tokens.txt']) {
        const response = await fetch('/models/'+name);
        if (!response.ok) throw Error('Missing fixture '+name);
        module.FS_createDataFile('/model',name,new Uint8Array(await response.arrayBuffer()),true,false,false);
      }
      recognizer = new OfflineRecognizer({
        featConfig:{sampleRate:16000,featureDim:80},
        modelConfig:{tokens:'/model/tiny-tokens.txt',numThreads:1,provider:'cpu',modelType:'whisper',
          whisper:{encoder:'/model/tiny-encoder.int8.onnx',decoder:'/model/tiny-decoder.int8.onnx',
            language:'he',task:'transcribe',tailPaddings:-1}},
        decodingMethod:'greedy_search'
      }, module);
      if (!recognizer.handle) throw Error('Whisper recognizer failed to initialize');
      self.postMessage({type:'ready',ms:performance.now()-start,wasmHeapBytes:module.HEAPU8.buffer.byteLength});
      return;
    }
    const pcm = data.pcm;
    const digest = await crypto.subtle.digest('SHA-256',pcm.buffer);
    const hash = Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    const start = performance.now(), stream = recognizer.createStream();
    try {
      stream.acceptWaveform(16000,pcm); recognizer.decode(stream);
      self.postMessage({type:'result',text:recognizer.getResult(stream).text,inputSha256:hash,
        ms:performance.now()-start,wasmHeapBytes:module.HEAPU8.buffer.byteLength});
    } finally {stream.free();}
  } catch(error){ self.postMessage({type:'error',error:String(error.stack||error)}); }
};

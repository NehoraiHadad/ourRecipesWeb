// Browser-local q8 Transformers.js export advertised for Hebrew.
import {env, pipeline} from '/dist/transformers.min.js';
let asr;
self.onmessage = async ({data}) => {
  try {
    if(data.type === 'load'){
      const start=performance.now();
      env.allowRemoteModels=false;
      env.allowLocalModels=true;
      env.localModelPath='/';
      env.useBrowserCache=false;
      env.backends.onnx.wasm.numThreads=1;
      env.backends.onnx.wasm.wasmPaths=new URL('/dist/',self.location).href;
      asr=await pipeline('automatic-speech-recognition','model',{device:'wasm',dtype:'q8',local_files_only:true});
      self.postMessage({type:'ready',ms:performance.now()-start});
      return;
    }
    const pcm=data.pcm;
    const digest=await crypto.subtle.digest('SHA-256',pcm.buffer);
    const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    const start=performance.now();
    const result=await asr(pcm,{language:'hebrew',task:'transcribe',num_beams:1,do_sample:false,max_new_tokens:64});
    self.postMessage({type:'result',text:result.text,inputSha256:sha,ms:performance.now()-start});
  } catch(error){self.postMessage({type:'error',error:String(error.stack||error)});}
};

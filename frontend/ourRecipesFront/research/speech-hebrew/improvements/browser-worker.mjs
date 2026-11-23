// Isolated Apache-2.0 Sherpaw/Sherpa WASM evaluation, not a production replacement.
import {initASRModule,createOnlineRecognizer} from '/pkg/index.js';
let module,recognizer,busy=false;
self.onmessage=async({data})=>{
 if(busy)return;busy=true;
 try{
  if(data.type==='load'){
   const start=performance.now();module=await initASRModule();
   module.FS_createPath('/','model',true,true);
   for(const name of ['encoder.int8.onnx','decoder.int8.onnx','joiner.int8.onnx','tokens.txt']){
    const response=await fetch('/models/'+name);if(!response.ok)throw new Error('Local model fixture missing');
    module.FS_createDataFile('/model',name,new Uint8Array(await response.arrayBuffer()),true,false,false);
   }
   const config={featConfig:{sampleRate:16000,featureDim:80},modelConfig:{transducer:{encoder:'/model/encoder.int8.onnx',decoder:'/model/decoder.int8.onnx',joiner:'/model/joiner.int8.onnx'},
    tokens:'/model/tokens.txt',numThreads:1,provider:'cpu',modelType:'zipformer2',debug:0},
    decodingMethod:data.arm==='beam4'?'modified_beam_search':'greedy_search',maxActivePaths:4,enableEndpoint:0,hotwordsFile:'',blankPenalty:0};
   if (data.arm.startsWith('hints-')) {
    const recipe = data.arm.slice('hints-'.length);
    if (!['salad','cookies'].includes(recipe)) throw Error('Unknown recipe fixture');
    for (const file of ['bpe.vocab', recipe+'.txt']) {
      const response = await fetch('/hints/'+file);
      if (!response.ok) throw Error('Missing hotword fixture '+file);
      module.FS_createDataFile('/model',file,new Uint8Array(await response.arrayBuffer()),true,false,false);
    }
    config.decodingMethod='modified_beam_search';
    config.modelConfig.modelingUnit='bpe';
    config.modelConfig.bpeVocab='/model/bpe.vocab';
    config.hotwordsFile='/model/'+recipe+'.txt';
    config.hotwordsScore=1.5;
   }
   recognizer=createOnlineRecognizer(module,config);
   if (!recognizer.handle) throw Error('Failed to create Zipformer recognizer');
   self.postMessage({type:'ready',arm:data.arm,ms:performance.now()-start,wasmHeapBytes:module.HEAPU8?.buffer.byteLength,config:recognizer.config});
  }else{
   const pcm=Float32Array.from(data.pcm);
   const digest=await crypto.subtle.digest('SHA-256',pcm.buffer);
   const inputSha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
   const start=performance.now(),stream=recognizer.createStream();
   try{
    stream.acceptWaveform(16000,pcm);stream.acceptWaveform(16000,new Float32Array(24000));stream.inputFinished();
    while(recognizer.isReady(stream))recognizer.decode(stream);
    const result=recognizer.getResult(stream);
    self.postMessage({type:'result',text:result.text,ms:performance.now()-start,inputSha256,wasmHeapBytes:module.HEAPU8?.buffer.byteLength});
   }finally{stream.free();}
  }
 }catch(error){self.postMessage({type:'error',error:String(error?.stack||error)});}
 finally{busy=false;}
};

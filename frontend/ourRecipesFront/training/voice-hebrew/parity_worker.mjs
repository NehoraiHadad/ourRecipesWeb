import {Wllama} from '/runtime/wllama.js';
let model;
self.onmessage=async({data})=>{
 try {
  if(data.type==='load') {
   console.log('parity-load:model-fetch');
   const start=performance.now(),response=await fetch('/model');
   if(!response.ok)throw Error('model-transfer-failed');
   // Streaming response.blob() fails for this large file in this persistent
   // Chromium profile. Use the already validated V19 reader/Blob transfer path.
   const reader=response.body.getReader(),chunks=[];let loaded=0;
   for(;;){const r=await reader.read();if(r.done)break;loaded+=r.value.length;if(loaded>data.bytes)throw Error('model-too-large');chunks.push(r.value);}
   const blob=new Blob(chunks);chunks.length=0;console.log('parity-load:model-blob',blob.size);
   if(blob.size!==data.bytes)throw Error('model-size-mismatch');
   model=new Wllama({default:'/runtime/wllama.wasm'},{suppressNativeLog:false,logger:{log(){},debug(){},warn(){},error(...args){console.error(...args);}}});
   model.setCompat(null);console.log('parity-load:runtime');await model.loadModel([blob],data.settings);
   self.postMessage({type:'ready',ms:performance.now()-start,context:model.getLoadedContextInfo(),template:model.getChatTemplate(),crossOriginIsolated:self.crossOriginIsolated});
  } else if(data.type==='chat') {
   const start=performance.now();const response=await model.createChatCompletion(data.body);
   self.postMessage({type:'result',ms:performance.now()-start,response});
  } else if(data.type==='raw') {
   const start=performance.now();const response=await model.createCompletion(data.body);
   self.postMessage({type:'result',ms:performance.now()-start,response});
  } else if(data.type==='exit') {await model?.exit();self.postMessage({type:'exited'});}
 }catch(error){self.postMessage({type:'error',error:String(error),stack:error.stack});}
};

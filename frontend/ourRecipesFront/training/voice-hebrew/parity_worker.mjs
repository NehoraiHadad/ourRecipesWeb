import {Wllama} from '/runtime/wllama.js';
let model;
self.onmessage=async({data})=>{
 try {
  if(data.type==='load') {
   const start=performance.now(),response=await fetch('/model');
   if(!response.ok)throw Error('model-transfer-failed');
   const blob=await response.blob();
   if(blob.size!==data.bytes)throw Error('model-size-mismatch');
   model=new Wllama({default:'/runtime/wllama.wasm'},{suppressNativeLog:true,logger:{log(){},debug(){},warn(){},error(...args){console.error(...args);}}});
   model.setCompat(null);await model.loadModel([blob],data.settings);
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

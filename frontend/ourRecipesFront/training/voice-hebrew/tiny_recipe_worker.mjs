import {Wllama} from '/runtime/wllama.js';
let model,controller;
self.onmessage=async({data})=>{
 if(data.type==='abort'){controller?.abort();return;}
 try{
  if(data.type==='load'){
   const began=performance.now();controller=new AbortController();const response=await fetch('/model',{signal:controller.signal});if(!response.ok)throw Error('Model transfer failed');
   const reader=response.body.getReader(),chunks=[];let loaded=0,last=0;
   for(;;){const r=await reader.read();if(r.done)break;chunks.push(r.value);loaded+=r.value.length;if(performance.now()-last>500){last=performance.now();self.postMessage({type:'download',loaded,total:data.bytes});}}
   const blob=new Blob(chunks);chunks.length=0;if(blob.size!==data.bytes)throw Error('Model byte count mismatch');
   let integrity;for(let i=0;i<100;i++){integrity=await (await fetch('/model-integrity')).json();if(integrity.status!=='pending')break;await new Promise(r=>setTimeout(r,100));}if(integrity.status!=='verified')throw Error('Model SHA verification failed');
   model=new Wllama({default:'/runtime/wllama.wasm'},{suppressNativeLog:true,logger:{log(){},debug(){},warn(){},error(...args){console.error(...args);}}});model.setCompat(null);
   await model.loadModel([blob],{n_ctx:1536,n_batch:128,n_ubatch:64,n_threads:Math.min(4,navigator.hardwareConcurrency||1),n_gpu_layers:0,jinja:true,reasoning:false,default_template_kwargs:{enable_thinking:false},warmup:true,ctx_shift:false,seed:42});
   const template=model.getChatTemplate();if(!template)throw Error('Official embedded chat template absent');
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(template)))).map(v=>v.toString(16).padStart(2,'0')).join('');
   self.postMessage({type:'ready',ms:performance.now()-began,templateSha256:sha,template,loadedContext:model.getLoadedContextInfo(),crossOriginIsolated:self.crossOriginIsolated});
  }else if(data.type==='generate'){
   controller=new AbortController();const began=performance.now();let text='',firstTokenMs=null,finishReason=null,usage=null;
   const stream=await model.createChatCompletion({messages:data.messages,temperature:0,seed:42,max_tokens:data.schema?160:80,chat_template_kwargs:{enable_thinking:false},cache_prompt:true,abortSignal:controller.signal,stream:true,...(data.schema?{response_format:{type:'json_schema',json_schema:{name:'recipe_response',strict:true,schema:data.schema}}}:{})});
   for await(const chunk of stream){const choice=chunk.choices?.[0];const delta=choice?.delta?.content||'';if(delta&&firstTokenMs===null)firstTokenMs=performance.now()-began;text+=delta;finishReason=choice?.finish_reason||finishReason;usage=chunk.usage||usage;}
   self.postMessage({type:'result',text,ms:performance.now()-began,firstTokenMs,finishReason,usage});
  }else if(data.type==='exit'){await model?.exit();self.postMessage({type:'exited'});}
 }catch(error){self.postMessage({type:'error',message:String(error?.message||error),stack:error?.stack});}
};

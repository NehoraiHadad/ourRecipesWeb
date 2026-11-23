// Synthesize new Hebrew prompts with the research worker and local pinned model files.
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createReadStream} from 'node:fs';
import {readFile, mkdir, writeFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {wav} from '../../metrics.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const research = path.resolve(here,'../..');
const app = path.resolve(research,'../..');
const cache = process.env.STYLE_CACHE || '/dev/shm/kitchen-styles';
const extra = process.env.SPEECH_EXTRA_DIR || '/dev/shm/ourrecipes-speech-models';
const runtime = process.env.SPEECH_RUNTIME_DIR || '/workspace/ourRecipesWeb/frontend/ourRecipesFront/public/voice/runtime';
const prompts = JSON.parse(await readFile(process.env.SPEECH_PROMPTS || path.join(here,'cases.json')));
const dist = path.dirname(createRequire(import.meta.url).resolve('pocket-tts-onnx/package.json'))+'/dist';
await mkdir(cache,{recursive:true});
const bundle = path.join(cache,'runtime.js');
await build({stdin:{contents:`export {PocketTTS} from '${dist}/tts.js'; export {HebrewG2P} from '${dist}/g2p.js'; export {resolveOptions} from '${dist}/options.js'; export * as ort from '${dist}/ort.web.js';`,resolveDir:app},bundle:true,platform:'browser',format:'esm',outfile:bundle});
const routes = new Map([
 ['/speech/runtime.js',bundle],['/speech/tts-worker.mjs',path.join(research,'tts-worker.mjs')],
 ['/speech/metrics.mjs',path.join(research,'metrics.mjs')],['/voice/hebrew-speech.js',path.join(app,'public/voice/hebrew-speech.js')]
]);
const models = [];
for(const name of ['model.onnx','renikud.onnx','assets.json']) {
 const url='/models/tts/he/'+name; models.push(url); routes.set(url,'/tmp/voice-models/tts/he/'+name);
}
for(const name of ['he_IL-noa-medium.onnx','he_IL-noa-medium.onnx.json']){
 const url='/models/piper/'+name; models.push(url); routes.set(url,path.join(extra,name));
}
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']) routes.set('/voice/runtime/tts/'+name,path.join(runtime,'tts',name));
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html','content-security-policy':"connect-src 'self'"}).end('<title>Local Hebrew TTS</title>');return;}
 const file=routes.get(req.url);
 if(!file){res.writeHead(404).end();return;}
 try {const {size}=await stat(file);res.writeHead(200,{'content-length':size,'content-type':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream'});createReadStream(file).pipe(res);}
 catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin);
 await page.evaluate(async models=>{
  const cache=await caches.open('styles');
  await cache.addAll(models);
  window.start=()=>{window.worker=new Worker('/speech/tts-worker.mjs',{type:'module'});};
  window.call=data=>new Promise((resolve,reject)=>{
   const frames=[];const timeout=setTimeout(()=>reject(new Error('TTS timeout')),120000);
   window.worker.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message));};
   window.worker.onmessage=({data})=>{
    if(data.type==='audio'){frames.push(data.pcm);return;}
    clearTimeout(timeout);
    if(data.type==='error'){reject(new Error(data.message));return;}
    if(frames.length)data.pcm=frames.flatMap(frame=>Array.from(frame));
    resolve(data);
   };
   window.worker.postMessage(data);
  });
 },models);
 for(const [kind,voices] of [['pocket',['omer','liat']],['piper',['noa']]]){
  await page.evaluate(async kind=>{window.start();await window.call({type:'load',kind,cache:'styles'});},kind);
  for(const voice of voices){
   for(const prompt of prompts){
    const r=await page.evaluate(async args=>window.call(args),{type:'speak',voice,text:prompt.text});
    if(!r.pcm?.length||!r.pcm.every(Number.isFinite)||!r.pcm.some(x=>Math.abs(x)>0.001))throw Error('Invalid synthesized speech');
    await writeFile(path.join(cache,voice+'-'+prompt.id+'.wav'),wav(Float32Array.from(r.pcm),r.sampleRate),{flag:'wx'});
   }
   console.log('Synthesized',voice,prompts.length);
  }
  await page.evaluate(()=>window.worker.terminate());
 }
} finally {await browser.close();server.close();}

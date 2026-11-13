// Separate research harness. No Next.js/app/timer/mobile mutations.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm,appendFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
import {cases,modes,prompt,schema,evaluateStructure} from './tiny_recipe_controls.mjs';
const root=import.meta.dirname;
const plan=JSON.parse(await readFile(path.join(root,'verification/tiny-recipe-control-plan-20261113.json'),'utf8'));
const name=process.argv[2]||'qwen35-08';const spec=plan.models[name];if(!spec)throw Error('Unknown frozen model');
const output=path.join(root,'runs/tiny-recipe-controls',name);await mkdir(path.dirname(output),{recursive:true});await mkdir(output,{recursive:false});
const hash=async file=>new Promise((resolve,reject)=>{const h=createHash('sha256'),s=createReadStream(file);s.on('error',reject);s.on('data',b=>h.update(b));s.on('end',()=>resolve(h.digest('hex')));});
for(const[file,sha]of Object.entries(plan.source_sha256))if(await hash(path.join(root,file))!==sha)throw Error('Frozen source changed: '+file);
const runtime=path.resolve(root,'../../public/voice/runtime/llm');
for(const[file,sha]of Object.entries(plan.runtime_sha256))if(await hash(path.join(runtime,file))!==sha)throw Error('Runtime changed: '+file);
let integrity={status:'pending'},downloadProcess=null;
const local=spec.local_path&&await stat(spec.local_path).then(s=>s.isFile(),()=>false);
if(local){if(await hash(spec.local_path)!==spec.sha256)throw Error('Cached model integrity mismatch');integrity={status:'verified',bytes:spec.bytes,sha256:spec.sha256,source:'existing local fixture,not a new network download'};}
const requests=[],events=[];
const event=async data=>{events.push(data);await appendFile(path.join(output,'events.jsonl'),JSON.stringify({utc:new Date().toISOString(),...data})+'\n');};
const server=createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="he"><meta charset="utf-8"><title>Tiny recipe model research</title><h1>ניסוי שיחה מקומי לפי מתכון</h1><pre id="progress">ממתין להפעלה</pre></html>');return;}
 if(req.url==='/worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(root,'tiny_recipe_worker.mjs')));return;}
 if(req.url==='/model-integrity'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(integrity));return;}
 if(req.url?.startsWith('/runtime/')){
  const file=path.basename(req.url);if(!['wllama.js','wllama.wasm'].includes(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':'text/javascript');createReadStream(path.join(runtime,file)).pipe(res);return;
 }
 if(req.url==='/model'){
  res.setHeader('Content-Length',spec.bytes);res.setHeader('Content-Type','application/octet-stream');
  if(local){createReadStream(spec.local_path).pipe(res);return;}
  if(downloadProcess){res.writeHead(409);res.end();return;}
  // urllib uses inherited verified proxy/CA trust. Only frozen public model
  // bytes leave this host; browser prompts have no external network endpoint.
  const code="import sys,urllib.request,hashlib,json\nh=hashlib.sha256();n=0\nwith urllib.request.urlopen(sys.argv[1],timeout=90) as r:\n while True:\n  b=r.read(1048576)\n  if not b:break\n  h.update(b);n+=len(b);sys.stdout.buffer.write(b);sys.stdout.buffer.flush()\nprint(json.dumps({'bytes':n,'sha256':h.hexdigest()}),file=sys.stderr,flush=True)\n";
  downloadProcess=spawn('python3',['-u','-c',code,spec.url],{stdio:['ignore','pipe','pipe']});let errors='';downloadProcess.stderr.on('data',b=>{errors+=b.toString();});downloadProcess.stdout.pipe(res,{end:false});
  downloadProcess.on('close',code=>{try{const actual=JSON.parse(errors.trim());if(code!==0||actual.bytes!==spec.bytes||actual.sha256!==spec.sha256)throw Error('Remote integrity mismatch');integrity={status:'verified',...actual,source:'remote streamed,not persisted on host'};}catch(e){integrity={status:'failed',error:String(e)};}res.end();});res.on('close',()=>{if(!res.writableEnded)downloadProcess?.kill();});return;
 }
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp('/tmp/tiny-recipe-browser-');let browser,timer;const memory=[];const started=Date.now();
const ps=()=>execFileSync('ps',['-eo','pid=,ppid=,rss=,args='],{encoding:'utf8'}).trim().split('\n').map(l=>{const match=l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);return match?{pid:+match[1],parent:+match[2],rss:+match[3],args:match[4]}:null;}).filter(Boolean);
const sample=()=>{const rows=ps(),owned=new Set(rows.filter(r=>r.args.includes(profile)&&/chrom(e|ium)/.test(r.args)).map(r=>r.pid));let more=true;while(more){more=false;for(const r of rows)if(owned.has(r.parent)&&!owned.has(r.pid)){owned.add(r.pid);more=true;}}memory.push({elapsedMs:Date.now()-started,sumRssMiB:rows.filter(r=>owned.has(r.pid)).reduce((n,r)=>n+r.rss,0)/1024});};
const proof={model:name,spec,scope:'Actual cloud Chromium browser inference on WASM CPU;software WebGPU capability probe only. Authored development fixtures,not held tests or physical phone/audio.',trainingPerformed:false,physicalDeviceTested:false,recordedSpeech:false,freshHeldSetsInferred:false,applicationStateCommitted:false,cases:[]};
try{
 browser=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-webgpu']});sample();timer=setInterval(sample,500);const page=await browser.newPage();page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==origin)requests.push(r.url());});await page.goto(origin);
 proof.browser=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();return{userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,crossOriginIsolated:self.crossOriginIsolated,webgpu:{api:!!navigator.gpu,adapter:!!a,info:a?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device}:null,features:a?[...a.features]:[]}};});
 await page.exposeFunction('researchProgress',data=>event(data));
 await page.evaluate(()=>{window.worker=new Worker('/worker.mjs',{type:'module'});window.call=(data,timeout)=>new Promise((resolve,reject)=>{let deadline=setTimeout(()=>{window.worker.postMessage({type:'abort'});reject(Error('Bounded operation timeout'));},timeout);const listener=({data:r})=>{if(r.type==='download'){document.querySelector('#progress').textContent=`${r.loaded}/${r.total}`;return;}window.worker.removeEventListener('message',listener);clearTimeout(deadline);if(r.type==='error')reject(Error(r.message));else resolve(r);};window.worker.addEventListener('message',listener);window.worker.postMessage(data);});});
 await event({phase:'loading',model:name});proof.load=await page.evaluate(bytes=>window.call({type:'load',bytes},180000),spec.bytes);await event({phase:'ready',loadMs:proof.load.ms});
 for(const mode of modes){for(const item of cases){
  await event({phase:'generating',mode,id:item.id});const result=await page.evaluate(({messages,schema})=>window.call({type:'generate',messages,schema},90000),{messages:prompt(item,mode),schema:mode==='structured'?schema(item.recipe):null});
  const row={mode,id:item.id,input:item.text,expectedUpdates:item.expectedUpdates,replyRubric:item.replyRubric,...result,...(mode==='structured'?{evaluation:evaluateStructure(result.text,item)}:{})};proof.cases.push(row);await writeFile(path.join(output,'partial.json'),JSON.stringify(proof,null,2));await event({phase:'completed',mode,id:item.id,ms:row.ms,text:row.text});console.log(JSON.stringify({mode,id:item.id,ms:row.ms,text:row.text}));
 }}
 proof.completed=true;
}catch(error){proof.completed=false;proof.error=String(error);console.error(error);process.exitCode=1;}
finally{
 clearInterval(timer);sample();proof.modelIntegrity=integrity;proof.browserExternalRequests=requests;proof.memory={peakChromiumProcessSumMiB:Math.max(...memory.map(r=>r.sumRssMiB)),samples:memory,scope:'Owned browser process RSS sum;includes browser/worker/WASM/load copies and may double-count shared pages. Not model-only RAM,not phone RAM.'};proof.seconds=(Date.now()-started)/1000;
 if(browser)await browser.close();downloadProcess?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true});proof.dedicatedBrowserClosed=true;
 await writeFile(path.join(output,'result.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({completed:proof.completed,cases:proof.cases.length,seconds:proof.seconds,error:proof.error,externalRequests:requests.length}));
}

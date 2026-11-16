// Isolated local-only development comparison; no production state or held tests.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {jobs as baseJobs,settings,modelPath} from './parity_protocol.mjs';
import {cases,evaluateStructure} from './tiny_recipe_cases.mjs';
const root=import.meta.dirname,runId=process.argv[2]||'20261116-qwen06-v1';
if(!/^[a-zA-Z0-9-]+$/.test(runId))throw Error('Invalid run id');
const out=path.join(root,'runs/browser-native-parity',runId);
await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});
const hash=async f=>{const h=createHash('sha256');for await(const b of createReadStream(f))h.update(b);return h.digest('hex');};
const frozen=JSON.parse(await readFile(path.join(root,'verification/browser-native-parity-plan-20261116.json'),'utf8'));
const jobs=baseJobs.filter(j=>!frozen.case_ids||frozen.case_ids.includes(j.id)).map(j=>({...j,body:{...j.body,...frozen.request_overrides}}));
for(const [f,sha] of Object.entries(frozen.source_sha256))if(await hash(path.join(root,f))!==sha)throw Error('Unfrozen source: '+f);
for(const [f,sha] of Object.entries(frozen.artifact_sha256))if(await hash(f)!==sha)throw Error('Artifact mismatch: '+f);
const result={runId,plan:frozen,scope:'Cloud CPU native and actual Chromium WASM. Not a physical phone, audio, held test or training.',trainingPerformed:false,physicalDeviceTested:false,heldTestsInferred:false,applicationStateCommitted:false,environment:{platform:os.platform(),arch:os.arch(),cpuModel:os.cpus()[0]?.model},native:[],browser:[],diagnostics:[]};
const event=async data=>{console.log(JSON.stringify(data));await appendFile(path.join(out,'events.jsonl'),JSON.stringify({utc:new Date().toISOString(),...data})+'\n');};
const save=()=>writeFile(path.join(out,'partial.json'),JSON.stringify(result,null,2));
let native,server,browser,profile;const external=[],nativeLog=[];
const nativeOrigin='http://127.0.0.1:18761';
async function post(endpoint,body){const start=performance.now();const r=await fetch(nativeOrigin+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});const response=await r.json();if(!r.ok)throw Error(JSON.stringify(response));return{ms:performance.now()-start,response};}
const summarize=r=>({text:r.choices?.[0]?.message?.content??r.choices?.[0]?.text??'',tokens:r.__verbose?.tokens??null,prompt:r.__verbose?.prompt??null,finish:r.choices?.[0]?.finish_reason,usage:r.usage});
try {
 const args=['--model',modelPath,'--host','127.0.0.1','--port','18761','--threads','4','--threads-batch','4','--ctx-size','1536','--batch-size','128','--ubatch-size','64','--parallel','1','--n-gpu-layers','0','--jinja','--reasoning','off','--chat-template-kwargs','{"enable_thinking":false}','--no-context-shift','--flash-attn','off','--no-webui','--load-mode','none'];
 result.nativeArgs=args;native=spawn('/tmp/voice-parity-native/build/bin/llama-server',args,{stdio:['ignore','pipe','pipe']});
 native.stdout.on('data',b=>nativeLog.push(b.toString()));native.stderr.on('data',b=>nativeLog.push(b.toString()));
 let ready=false;for(let i=0;i<120;i++){if(native.exitCode!==null)throw Error('Native server exited');try{if((await fetch(nativeOrigin+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw Error('Native load timeout');await event({phase:'native-ready'});
 if(frozen.reuse_native_result){
  const prior=JSON.parse(await readFile(frozen.reuse_native_result,'utf8'));
  if(jobs.some(j=>JSON.stringify(j.body)!==JSON.stringify(prior.native.find(r=>r.id===j.id)?.request)))throw Error('Reused native requests differ');
  result.native=prior.native.filter(r=>jobs.some(j=>j.id===r.id));result.nativeReusedFrom=frozen.reuse_native_result;await save();
 }
 for(const job of (frozen.reuse_native_result?[]:jobs)){
  const rendered=await post('/apply-template',job.body);
  const tokenized=await post('/tokenize',{content:rendered.response.prompt,add_special:true,parse_special:true});
  const r=await post('/v1/chat/completions',job.body);
  result.native.push({id:job.id,kind:job.kind,request:job.body,rendered:rendered.response,tokenized:tokenized.response,...r,...summarize(r.response)});
  await save();await event({phase:'native-case',id:job.id,ms:r.ms,text:summarize(r.response).text});
 }
 const runtime=path.resolve(root,'../../public/voice/runtime/llm');
 server=createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Local parity development study</title>');return;}
  if(req.url==='/worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(root,'parity_worker.mjs')));return;}
  if(req.url==='/model'){res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',frozen.model.bytes);createReadStream(modelPath).pipe(res);return;}
  if(req.url?.startsWith('/runtime/')){const f=path.basename(req.url);if(['wllama.js','wllama.wasm'].includes(f)){res.setHeader('Content-Type',f.endsWith('.wasm')?'application/wasm':'text/javascript');createReadStream(path.join(runtime,f)).pipe(res);return;}}
  res.writeHead(404);res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 profile=await mkdtemp('/tmp/voice-parity-browser-');browser=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 result.browserFailedRequests=[];result.browserConsole=[];result.browserNetwork=[];
 browser.on('requestfailed',r=>result.browserFailedRequests.push({url:r.url(),failure:r.failure()}));
 browser.on('console',m=>result.browserConsole.push({type:m.type(),text:m.text()}));
 browser.on('response',r=>result.browserNetwork.push({url:r.url(),status:r.status(),headers:r.headers()}));
 const page=await browser.newPage();await page.route(url=>/^https?:/.test(url.href)&&url.origin!==origin,async route=>{external.push(route.request().url());await route.abort();});
 await page.goto(origin);result.browserEnvironment=await page.evaluate(()=>({userAgent:navigator.userAgent,crossOriginIsolated:self.crossOriginIsolated,hardwareConcurrency:navigator.hardwareConcurrency}));
 await page.evaluate(()=>{window.worker=new Worker('/worker.mjs',{type:'module'});window.call=(data)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Worker timeout')),120000);window.worker.onmessage=({data:r})=>{clearTimeout(t);r.type==='error'?reject(Error(r.error+'\n'+r.stack)):resolve(r);};window.worker.postMessage(data);});});
 result.browserLoad=await page.evaluate(({settings,bytes})=>window.call({type:'load',settings,bytes}),{settings,bytes:frozen.model.bytes});await event({phase:'browser-ready',ms:result.browserLoad.ms});
 for(const job of jobs){const r=await page.evaluate(body=>window.call({type:'chat',body}),job.body);result.browser.push({id:job.id,kind:job.kind,request:job.body,...r,...summarize(r.response)});await save();await event({phase:'browser-case',id:job.id,ms:r.ms,text:summarize(r.response).text});}
 // Predeclared diagnostic: at most four control divergences, one forced-prefix
 // token each. Both backends receive identical integer prompt IDs.
 for(const job of jobs.filter(j=>j.kind==='control')){
  const n=result.native.find(r=>r.id===job.id),b=result.browser.find(r=>r.id===job.id);
  if(JSON.stringify(n.tokens)===JSON.stringify(b.tokens))continue;
  let at=0;while(at<Math.min(n.tokens?.length??0,b.tokens?.length??0)&&n.tokens[at]===b.tokens[at])at++;
  if(at>32){result.diagnostics.push({id:job.id,skipped:'First divergence after frozen 32-token bound',at});continue;}
  const promptIds=n.tokenized.tokens.concat((n.tokens??[]).slice(0,at));
  const body={prompt:promptIds,max_tokens:1,temperature:0,seed:42,cache_prompt:false,stream:false,verbose:true,return_tokens:true,logprobs:5};
  const nr=await post('/v1/completions',body),br=await page.evaluate(body=>window.call({type:'raw',body}),body);
  result.diagnostics.push({id:job.id,divergenceAt:at,promptIds,native:nr,browser:br});await save();await event({phase:'forced-prefix',id:job.id,at});
 }
 result.comparison=jobs.map(job=>{const n=result.native.find(r=>r.id===job.id),b=result.browser.find(r=>r.id===job.id),item=cases.find(c=>c.id===job.id);return{id:job.id,kind:job.kind,promptExact:n.prompt!==null&&n.prompt===b.prompt,nativeRenderedMatchesActual:n.rendered.prompt===n.prompt,promptCountMatches:n.usage?.prompt_tokens===b.usage?.prompt_tokens,generatedTokensExact:n.tokens!==null&&JSON.stringify(n.tokens)===JSON.stringify(b.tokens),textExact:n.text===b.text,...(item?{nativeEvaluation:evaluateStructure(n.text,item),browserEvaluation:evaluateStructure(b.text,item)}:{})};});
 result.completed=true;
}catch(error){result.completed=false;result.error=String(error);process.exitCode=1;}
finally {
 if(browser)await browser.close();if(profile)await rm(profile,{recursive:true,force:true});
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(native){native.kill('SIGTERM');await Promise.race([new Promise(r=>native.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(native.exitCode===null)native.kill('SIGKILL');}
 result.externalBrowserRequestsBlocked=external;result.dedicatedBrowserClosed=!!browser;
 await writeFile(path.join(out,'native-server.log'),nativeLog.join(''));await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
 await event({phase:'finished',completed:result.completed,error:result.error,compared:result.comparison?.length??0});
}

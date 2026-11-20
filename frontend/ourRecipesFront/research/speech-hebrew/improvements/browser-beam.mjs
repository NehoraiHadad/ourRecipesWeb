import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,stat,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const MODELS='/tmp/voice-models/asr/sherpa-onnx',PACKAGE='/dev/shm/ourrecipes-speech-wasm/sherpaw-asr/dist';
const INPUT='/dev/shm/ourrecipes-speech-decoder-input';
const SMOKE=process.env.SPEECH_SMOKE==='1';
const manifest=JSON.parse(await readFile(path.join(ROOT,'evidence/input-reconstruction.json'),'utf8'));
const result={smoke:SMOKE,startedUtc:new Date().toISOString(),engine:'@sherpaw/asr@0.3.0, CPU WASM',records:[],loads:[],memory:[],externalRequests:[],completed:false};
const out=path.join(ROOT,`evidence/browser-${SMOKE?'smoke':'full'}.json`);
try{await stat(out);throw new Error('Preserve existing browser run');}catch(e){if(e.code!=='ENOENT')throw e;}
const server=createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Speech decoder comparison</title>');return;}
  let base,relative;
  if(name.startsWith('/pkg/')){base=PACKAGE;relative=name.slice(5);}
  else if(name.startsWith('/models/')){base=MODELS;relative=name.slice(8);}
  else if(name==='/worker.mjs'){base=ROOT;relative='browser-worker.mjs';}
  else{res.writeHead(404).end();return;}
  const file=path.resolve(base,relative);if(!file.startsWith(path.resolve(base)+path.sep)){res.writeHead(403).end();return;}
  const s=await stat(file);res.setHeader('Content-Length',s.size);res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream');createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,profile=await mkdtemp('/dev/shm/ourrecipes-sherpa-browser-');
const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){result.externalRequests.push(route.request().url());return route.abort();}return route.continue();});
const page=await context.newPage();page.on('console',message=>{if(message.type()==='error')console.log('browser error',message.text());});
let phase='baseline';
const memory=async()=>{
 const rows=execFileSync('ps',['-eo','pid,ppid,rss,args'],{encoding:'utf8'}).split('\n').map(x=>x.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m=>({pid:+m[1],parent:+m[2],rss:+m[3],args:m[4]}));
 const ids=new Set(rows.filter(r=>r.args.includes(profile)).map(r=>r.pid));for(let changed=true;changed;){changed=false;for(const r of rows)if(ids.has(r.parent)&&!ids.has(r.pid)){ids.add(r.pid);changed=true;}}
 let pss=0;for(const pid of ids)try{pss+=Number((await readFile(`/proc/${pid}/smaps_rollup`,'utf8')).match(/^Pss:\s+(\d+)/m)?.[1]||0);}catch{}
 result.memory.push({utc:new Date().toISOString(),phase,sumRssMiB:rows.filter(r=>ids.has(r.pid)).reduce((s,r)=>s+r.rss,0)/1024,pssMiB:pss/1024});
};
const timer=setInterval(()=>void memory(),1000);
try{
 await page.goto(origin);result.browser=await page.evaluate(()=>({userAgent:navigator.userAgent,crossOriginIsolated,cores:navigator.hardwareConcurrency}));
 for(const arm of ['greedy','beam4']){
  phase=arm+'-load';
  const call=async payload=>page.evaluate(payload=>{window.worker ||= new Worker('/worker.mjs',{type:'module'});return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('WASM request timeout')),180000);
   window.worker.onmessage=({data})=>{clearTimeout(timeout);resolve(data);};window.worker.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message));};window.worker.postMessage(payload);
  });},payload);
  const loaded=await call({type:'load',arm});result.loads.push(loaded);await writeFile(out,JSON.stringify(result,null,2));
  if(loaded.type==='error')throw new Error(loaded.error);
  phase=arm+'-decode';
  for(const row of SMOKE?manifest.records.slice(0,1):manifest.records){
   const bytes=await readFile(path.join(INPUT,row.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
   const pcm=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),value=await call({type:'transcribe',pcm:Array.from(pcm)});
   if(value.type==='error')throw new Error(value.error);assert.equal(value.inputSha256,row.sha256);
   result.records.push({arm,id:row.id,...value});
   if(result.records.length%10===0||SMOKE)console.log(arm,result.records.length,row.id,value.text);
   await writeFile(out,JSON.stringify(result,null,2));
  }
  await memory();await page.evaluate(()=>{window.worker.terminate();window.worker=null;});
 }
 result.completed=true;result.completedUtc=new Date().toISOString();
}finally{
 clearInterval(timer);await memory();await writeFile(out,JSON.stringify(result,null,2));await context.close();server.closeAllConnections();server.close();await rm(profile,{recursive:true,force:true});
}

// Actual ORT Web WASM parity/latency on PRETOKENIZED fixtures. No acoustic or
// physical-device claims; tokenizer parity and semantic accuracy are separate.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat,readFile,writeFile,access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const artifact=path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node browser-smoke.mjs /path/to/run/onnx');
const runtime=path.resolve(import.meta.dirname,'../../public/voice/runtime/asr');
const fixtureDir=process.argv[3]&&!process.argv[3].startsWith('--')?path.resolve(process.argv[3]):artifact;
const fixtures=JSON.parse(await readFile(path.join(fixtureDir,'browser-fixtures.json'),'utf8'));
const int8Only=process.argv.includes('--int8-only');
const hasFp32=!int8Only&&await access(path.join(artifact,'model.onnx')).then(()=>true,()=>false);
const server=createServer(async (req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','credentialless');
  if (req.url==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="he"><title>Encoder browser check</title><body>Local pretokenized encoder check</body></html>');return;}
  try {
    const root=req.url?.startsWith('/runtime/')?runtime:artifact;
    const name=decodeURIComponent((req.url || '').replace(/^\/(?:runtime|artifact)\//,''));
    const file=path.resolve(root,name);if(!file.startsWith(root+path.sep))throw new Error('path');
    const info=await stat(file);res.setHeader('Content-Length',info.size);
    if(file.endsWith('.mjs'))res.setHeader('Content-Type','text/javascript');
    if(file.endsWith('.wasm'))res.setHeader('Content-Type','application/wasm');
    createReadStream(file).pipe(res);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const processes=()=>{
  try{return execFileSync('ps',['-eo','pid=,ppid=,rss=,comm='],{encoding:'utf8'}).trim().split('\n').map(line=>{const [pid,ppid,rss,comm]=line.trim().split(/\s+/);return{pid:+pid,ppid:+ppid,rss:+rss,comm};});}
  catch{return[];}
};
const previousPids=new Set(processes().map(p=>p.pid));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const rootPid=processes().find(p=>!previousPids.has(p.pid)&&p.ppid===process.pid&&/chrom(e|ium)/.test(p.comm))?.pid;
let peakRssKiB=0;
const sampleRss=()=>{
  if(!rootPid)return;const rows=processes(),owned=new Set([rootPid]);let added=true;
  while(added){added=false;for(const p of rows)if(owned.has(p.ppid)&&!owned.has(p.pid)){owned.add(p.pid);added=true;}}
  peakRssKiB=Math.max(peakRssKiB,rows.filter(p=>owned.has(p.pid)).reduce((sum,p)=>sum+p.rss,0));
};
const sampler=setInterval(sampleRss,200);sampleRss();
try {
  const page=await browser.newPage();const external=[];
  page.on('request',r=>{if(/^https?:/.test(r.url()) && new URL(r.url()).origin!==base)external.push(r.url());});
  await page.goto(base);
  const result=await page.evaluate(async ({fixtures,hasFp32})=>{
    const ort=await import('/runtime/ort.wasm.min.mjs');ort.env.wasm.wasmPaths='/runtime/';ort.env.wasm.numThreads=1;
    const cases=[],loads={};let started;
    for(const file of hasFp32?['model.onnx','model.int8.onnx']:['model.int8.onnx']){
    started=performance.now();const session=await ort.InferenceSession.create('/artifact/'+file,{executionProviders:['wasm']});
    loads[file]=performance.now()-started;
    for(const fixture of fixtures){
      const inputs=Object.fromEntries(Object.entries(fixture.inputs).map(([key,v])=>[key,new ort.Tensor('int64',BigInt64Array.from(v.data.map(BigInt)),v.dims)]));
      started=performance.now();const output=(await session.run(inputs)).logits;const ms=performance.now()-started;
      const reference=file==='model.onnx'?fixture.fp32_expected:fixture.expected;
      const expected=reference.flat(Infinity);let error=0, labelDisagreements=0,decisionDisagreements=0,acceptedEvidenceDisagreements=0;
      for(let i=0;i<expected.length;i++)error=Math.max(error,Math.abs(expected[i]-output.data[i]));
      const decisions=fixture.decisionRows || reference.map((_,row)=>({offset:row*8,indices:fixture.tasks[row]==='intent'?[3,4,5,6,7]:[0,1,2]}));
      for(const decision of decisions){
        const {offset,indices}=decision;
        const decide=values=>{
          const index=indices.reduce((best,i)=>values[i]>values[best]?i:best,indices[0]);
          const confidence=1/indices.reduce((sum,i)=>sum+Math.exp(values[i]-values[index]),0);
          return {index,accepted:confidence>=fixture.threshold};
        };
        const a=decide(expected.slice(offset,offset+8)),b=decide(Array.from(output.data.slice(offset,offset+8)));
        labelDisagreements+=Number(a.index!==b.index);decisionDisagreements+=Number(a.index!==b.index||a.accepted!==b.accepted);
      }
      if(fixture.spanItems){
        const width=output.dims[1];
        const evidence=(values,row,item)=>{
          const pick=(i,indices)=>{
            const offset=(row*width+i)*8;
            const label=indices.reduce((best,k)=>values[offset+k]>values[offset+best]?k:best,indices[0]);
            const confidence=1/indices.reduce((sum,k)=>sum+Math.exp(values[offset+k]-values[offset+label]),0);
            return {label,confidence};
          };
          if(item.task==='intent'){
            const p=pick(0,[3,4,5,6,7]);return{label:p.confidence>=fixture.threshold?p.label:6};
          }
          const pair=item.joint_gate?pick(0,[0,1,2]):null;
          if(pair?.label===2)return{label:2};
          const chunks=[];let active=null;
          for(const i of item.positions){
            const p=pick(i,[0,1,2]);if(p.label===2){active=null;continue;}
            const [begin,end]=item.offsets[i];
            if(!active||active.label!==p.label){active={...p,begin,end};chunks.push(active);}
            else{active.end=end;active.confidence=Math.min(active.confidence,p.confidence);}
          }
          if(chunks.length===1){
            const c=chunks[0],text=Array.from(item.current_utterance).slice(c.begin-item.current_start,c.end-item.current_start).join('');
            if(pair&&pair.label!==c.label)return{label:2};
            if(pair)c.confidence=Math.min(c.confidence,pair.confidence);
            const words=text.split(/\s+/).filter(w=>/\p{L}/u.test(w));
            const generic=new Set(['תיקון','לא','כן','עוד','אבל','אני','זה','עשיתי','סיימתי','בעצם']);
            if(words.length>=2&&words.some(w=>!generic.has(w))&&c.confidence>=fixture.threshold)return{label:c.label,evidence:text};
          }
          return{label:2};
        };
        for(let row=0;row<fixture.spanItems.length;row++)acceptedEvidenceDisagreements+=Number(JSON.stringify(evidence(expected,row,fixture.spanItems[row]))!==JSON.stringify(evidence(output.data,row,fixture.spanItems[row])));
      }
      cases.push({file,batch:output.dims[0],ms,maxAbsLogitError:error,labelDisagreements,decisionDisagreements,...(fixture.spanItems?{acceptedEvidenceDisagreements}:{})});
    }
    await session.release();}
    return {loads,cases,userAgent:navigator.userAgent,threads:1,fp32Tested:hasFp32};
  },{fixtures,hasFp32});
  sampleRss();
  const evidence={date:new Date().toISOString(),scope:'Actual cloud Chromium/ORT Web inference on tokenized tensor fixtures; no browser tokenizer, GPU, physical phone or semantic quality certification',...result,externalRequests:external,
    memory:{peakChromiumProcessSumMiB:rootPid?peakRssKiB/1024:null,sampleIntervalMs:200,scope:(int8Only?'INT8-only owned Chromium process tree. ':'Owned Chromium process tree during sequential FP32 and INT8 checks. ')+'Includes runtime/browser/retained allocations and may count shared pages repeatedly; not model-only or phone RAM.'}};
  await writeFile(path.join(fixtureDir,int8Only?'browser-int8-smoke.json':'browser-smoke.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
  assert.deepEqual(external,[]);
  for(const c of result.cases){
    if(c.file==='model.onnx')assert(c.maxAbsLogitError<1e-3,'FP32 numerical parity failed; evidence saved');
    // Dynamic INT8 arithmetic can differ between native SIMD and WASM.
    // Compare task decisions, publish the numeric drift, and require a full
    // browser semantic evaluation before integrating a real trained model.
    if('acceptedEvidenceDisagreements' in c)assert.equal(c.acceptedEvidenceDisagreements,0,'Native/Web accepted intent/evidence records differ; raw token drift is reported');
    else assert.equal(c.decisionDisagreements,0,'Native/Web task decisions differ; evidence saved');
  }
} finally {clearInterval(sampler);await browser.close();server.closeAllConnections();server.close();}

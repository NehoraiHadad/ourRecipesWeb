// Actual ORT Web WASM parity/latency on PRETOKENIZED fixtures. No acoustic or
// physical-device claims; tokenizer parity and semantic accuracy are separate.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat,readFile,writeFile,access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact=path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node browser-smoke.mjs /path/to/run/onnx');
const runtime=path.resolve(import.meta.dirname,'../../public/voice/runtime/asr');
const fixtures=JSON.parse(await readFile(path.join(artifact,'browser-fixtures.json'),'utf8'));
const hasFp32=await access(path.join(artifact,'model.onnx')).then(()=>true,()=>false);
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
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
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
      const expected=reference.flat();let error=0, labelDisagreements=0,decisionDisagreements=0;
      for(let i=0;i<expected.length;i++)error=Math.max(error,Math.abs(expected[i]-output.data[i]));
      for(let row=0;row<reference.length;row++){
        const indices=fixture.tasks[row]==='intent'?[3,4,5,6,7]:[0,1,2];
        const decide=values=>{
          const index=indices.reduce((best,i)=>values[i]>values[best]?i:best,indices[0]);
          const confidence=1/indices.reduce((sum,i)=>sum+Math.exp(values[i]-values[index]),0);
          return {index,accepted:confidence>=fixture.threshold};
        };
        const a=decide(reference[row]),b=decide(Array.from(output.data.slice(row*8,row*8+8)));
        labelDisagreements+=Number(a.index!==b.index);decisionDisagreements+=Number(a.index!==b.index||a.accepted!==b.accepted);
      }
      cases.push({file,batch:output.dims[0],ms,maxAbsLogitError:error,labelDisagreements,decisionDisagreements});
    }
    await session.release();}
    return {loads,cases,userAgent:navigator.userAgent,threads:1,fp32Tested:hasFp32};
  },{fixtures,hasFp32});
  const evidence={date:new Date().toISOString(),scope:'Actual cloud Chromium/ORT Web inference on tokenized tensor fixtures; no browser tokenizer, GPU, physical phone or semantic quality certification',...result,externalRequests:external};
  await writeFile(path.join(artifact,'browser-smoke.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
  assert.deepEqual(external,[]);
  for(const c of result.cases){
    if(c.file==='model.onnx')assert(c.maxAbsLogitError<1e-3,'FP32 numerical parity failed; evidence saved');
    // Dynamic INT8 arithmetic can differ between native SIMD and WASM.
    // Compare task decisions, publish the numeric drift, and require a full
    // browser semantic evaluation before integrating a real trained model.
    assert.equal(c.decisionDisagreements,0,'Native/Web task decisions differ; evidence saved');
  }
} finally {await browser.close();server.closeAllConnections();server.close();}

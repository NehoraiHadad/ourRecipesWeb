import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';

const [dir,out] = process.argv.slice(2);
assert(dir && out, 'Pass the prepared directory and a fresh output path');
const rows = JSON.parse(await readFile(path.join(dir,'fixtures.json')));
const pin = JSON.parse(await readFile(new URL('../evidence/protocol.json',import.meta.url)));
for (const [name,meta] of Object.entries(pin.models)) {
  if (!name.startsWith('asr/sherpa-onnx/')) continue;
  const bytes = await readFile(path.join(dir,'models',path.basename(name)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);
}
const server = spawn('python',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',dir],
  {stdio:['ignore','pipe','ignore']});
let browser;
try {
  const [line] = await once(server.stdout,'data');
  const origin = 'http://127.0.0.1:'+String(line).match(/port (\d+)/)[1];
  browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const ctx = await browser.newContext({serviceWorkers:'block'});
  const blocked = [];
  await ctx.route('**/*',route=>{
    const req = route.request();
    if (new URL(req.url()).origin === origin && req.method() === 'GET') return route.continue();
    blocked.push(req.url());
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(origin);
  const setup = await page.evaluate(async ()=>{
    const start = performance.now();
    const denoiser = await import('/filter.mjs');
    window.suppress = denoiser.filter;
    const initMs = performance.now()-start;
    const worker = new Worker('/worker.mjs',{type:'module'});
    window.call = payload=>new Promise((resolve,reject)=>{
      const timeout = setTimeout(()=>reject(Error('Worker timeout')),90000);
      worker.onmessage = ({data})=>{
        clearTimeout(timeout);
        if (data.type === 'error') reject(Error(data.error)); else resolve(data);
      };
      worker.onerror = e=>{clearTimeout(timeout);reject(Error(e.message));};
      worker.postMessage(payload);
    });
    const loaded = await window.call({type:'load',arm:'beam4'});
    if (loaded.type !== 'ready') throw Error('Decoder did not initialize');
    return {initMs,filterHeapBytes:denoiser.heapBytes()};
  });
  const records = [];
  for (const [i,row] of rows.entries()) {
    const pair = await page.evaluate(async ({file,reverse})=>{
      const response = await fetch('/'+file);
      if (!response.ok) throw Error('Missing fixture '+file);
      const pcm = new Float32Array(await response.arrayBuffer());
      const result = {};
      for (const arm of reverse ? ['filtered','raw'] : ['raw','filtered']) {
        const start = performance.now();
        const input = arm === 'raw' ? pcm : await window.suppress(pcm);
        const preprocessMs = performance.now()-start;
        if (!input.every(Number.isFinite)) throw Error('Invalid filter output');
        const decoded = await window.call({type:'transcribe',pcm:input});
        result[arm] = {text:decoded.text,inputSha256:decoded.inputSha256,decodeMs:decoded.ms,preprocessMs};
      }
      return result;
    },{file:row.file,reverse:i%2===1});
    assert.equal(pair.raw.inputSha256,row.sha256);
    for (const side of Object.values(pair)) {
      const s = score(row.reference,side.text);
      Object.assign(side,{wordErrors:s.wordErrors,words:s.referenceWords,
        negationCountDelta:s.negationCountDelta,missingAnchors:missing(side.text,row.anchors)});
    }
    records.push({...row,...pair});
    if (records.length%9===0) console.log('Paired clips',records.length);
  }
  assert.deepEqual(blocked,[]);
  await writeFile(out,JSON.stringify({browser:browser.version(),filterBytes:(await stat(path.join(dir,'rnnoise.js'))).size,
    ...setup,externalRequests:blocked,records},null,2)+'\n',{flag:'wx'});
} finally {
  try {await browser?.close();} finally {server.kill();}
}

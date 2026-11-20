/** Isolated speech-only research; no Next app, brain model or microphone calls. */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, modelURL } from '../../src/lib/voice/models';
import { score, noise, wav } from './metrics.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const APP=path.resolve(ROOT,'../..');
const FIXTURES=process.env.VOICE_MODEL_DIR || '/tmp/voice-models';
const EXTRA=process.env.SPEECH_EXTRA_DIR || '/dev/shm/ourrecipes-speech-models';
const RUNTIME=process.env.SPEECH_RUNTIME_DIR || '/workspace/ourRecipesWeb/frontend/ourRecipesFront/public/voice/runtime';
const OUT=process.env.SPEECH_OUTPUT || path.join(ROOT,'runs/20261120');
const SMOKE=process.env.SPEECH_SMOKE==='1';
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const json=async (name:string)=>JSON.parse(await readFile(name,'utf8'));

async function main() {
  await mkdir(path.dirname(OUT),{recursive:true});
  await mkdir(OUT,{recursive:false});
  const require=createRequire(import.meta.url);
  const pocket=path.dirname(require.resolve('pocket-tts-onnx/package.json'));
  const runtime=path.join(EXTRA,'runtime.js');
  await build({stdin:{contents:`export {PocketTTS} from '${pocket}/dist/tts.js'; export {HebrewG2P} from '${pocket}/dist/g2p.js'; export {resolveOptions} from '${pocket}/dist/options.js'; export * as ort from '${pocket}/dist/ort.web.js';`,resolveDir:APP},outfile:runtime,bundle:true,platform:'browser',format:'esm',minify:true});
  const cases=await json(path.join(ROOT,'cases.json'));
  const human=await json(path.join(ROOT,'evidence/human-fixtures.json'));
  const sources=await json(path.join(ROOT,'evidence/model-sources.json'));
  const fixtureHashes:Record<string,unknown>={};
  for (const kind of ['asr','tts'] as const) for (const file of MODELS[kind].files) {
    const name=path.join(FIXTURES,kind,file.path), raw=await readFile(name);
    if (raw.length!==file.bytes) throw new Error('Fixture bytes '+name);
    const metadata=sources.find((m:any)=>m.repo===MODELS[kind].repo).files.find((f:any)=>f.rfilename===file.path);
    if (metadata.lfs && hash(raw)!==metadata.lfs.sha256) throw new Error('Pinned model SHA mismatch '+name);
    fixtureHashes[`${kind}/${file.path}`]={bytes:raw.length,sha256:hash(raw)};
  }
  const piperName=path.join(EXTRA,'he_IL-noa-medium.onnx');
  if(hash(await readFile(piperName))!=='83b18c0b8fad6ac00fcea5c5bdf3c1fdbec182f9eadad9f97bc423ab4e22be7d') throw new Error('Piper SHA mismatch');
  fixtureHashes['piper/model']={bytes:(await stat(piperName)).size,sha256:hash(await readFile(piperName))};
  const files=['cases.json','metrics.mjs','metrics.test.mjs','tts-worker.mjs','benchmark.ts','PLAN.he.md','evidence/human-fixtures.json','evidence/model-sources.json'];
  const sourceHashes:Record<string,string>={};for(const file of files) sourceHashes[file]=hash(await readFile(path.join(ROOT,file)));
  const runtimeHashes:Record<string,string>={builtSpeechJs:hash(await readFile(runtime))};
  for(const name of ['asr/ort.wasm.min.mjs','asr/ort-wasm-simd-threaded.wasm','tts/ort-wasm-simd-threaded.wasm'])runtimeHashes[name]=hash(await readFile(path.join(RUNTIME,name)));
  const dependencies={};for(const name of ['pocket-tts-onnx','onnxruntime-web','playwright','esbuild'])dependencies[name]=require(name+'/package.json').version;
  await writeFile(path.join(OUT,'provenance.json'),JSON.stringify({baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:APP,encoding:'utf8'}).trim(),sourceHashes,fixtureHashes,runtimeHashes,dependencies,smoke:SMOKE},null,2));
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/','http://local'), name=decodeURIComponent(url.pathname);
      res.setHeader('Content-Security-Policy',"connect-src 'self'; worker-src 'self' blob:");
      if(name==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Hebrew speech research</title><p>Local speech-only benchmark</p>');return;}
      let base:string,relative:string;
      if(name==='/speech/runtime.js') {base=EXTRA;relative='runtime.js';}
      else if(name.startsWith('/speech/')) {base=ROOT;relative=name.slice(8);}
      else if(name.startsWith('/voice/runtime/')) {base=RUNTIME;relative=name.slice(15);}
      else if(name.startsWith('/voice/')) {base=path.join(APP,'public/voice');relative=name.slice(7);}
      else if(name.startsWith('/models/piper/')) {base=EXTRA;relative=name.slice(14);}
      else if(name.startsWith('/models/')) {base=FIXTURES;relative=name.slice(8);}
      else {res.writeHead(404).end();return;}
      const file=path.resolve(base,relative);if(!file.startsWith(path.resolve(base)+path.sep)){res.writeHead(403).end();return;}
      const metadata=await stat(file);
      const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'} as any)[ext]||'application/octet-stream');
      res.setHeader('Content-Length',metadata.size);createReadStream(file).pipe(res);
    } catch {res.writeHead(404).end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const profile=await mkdtemp('/dev/shm/ourrecipes-speech-profile-');
  const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const report:any={startedUtc:new Date().toISOString(),scope:'Real Chromium WASM CPU inference. Public human read speech and authored synthetic TTS loopback; simulated noise. No physical microphone/speaker/phone, V52 call or perceptual listening judgement.',smoke:SMOKE,tts:[],asr:[],load:[],externalRequests:[],memory:[]};
  let phase='baseline';
  const memory=async()=>{
    const rows=execFileSync('ps',['-eo','pid,ppid,rss,args'],{encoding:'utf8'}).split('\n').map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m=>({pid:+m![1],parent:+m![2],rss:+m![3],args:m![4]}));
    const ids=new Set(rows.filter(r=>r.args.includes(profile)).map(r=>r.pid));
    for(let changed=true;changed;){changed=false;for(const r of rows)if(ids.has(r.parent)&&!ids.has(r.pid)){ids.add(r.pid);changed=true;}}
    let pssKiB=0,available=true;
    for(const pid of ids)try{const text=await readFile(`/proc/${pid}/smaps_rollup`,'utf8');pssKiB+=Number(text.match(/^Pss:\s+(\d+)/m)?.[1]||0);}catch{available=false;}
    report.memory.push({utc:new Date().toISOString(),phase,processes:ids.size,sumRssMiB:rows.filter(r=>ids.has(r.pid)).reduce((s,r)=>s+r.rss,0)/1024,pssMiB:available?pssKiB/1024:null});
  };
  const timer=setInterval(()=>void memory(),1000);await memory();
  const page=await context.newPage();
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){report.externalRequests.push({url:route.request().url(),blocked:true});return route.abort();}return route.continue();});
  const generated:any[]=[];
  const save=async()=>writeFile(path.join(OUT,'results.json'),JSON.stringify(report,null,2));
  try {
    await page.goto(origin);
    report.browser=await page.evaluate(async()=>{await new Promise(r=>setTimeout(r,100));return {userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,crossOriginIsolated,selfOrigin:location.origin,localHebrewVoices:speechSynthesis.getVoices().filter(v=>v.localService&&/^(he|iw)(-|$)/i.test(v.lang)).map(v=>v.name)};});
    report.host={cpuMax:(await readFile('/sys/fs/cgroup/cpu.max','utf8')).trim(),memoryMax:(await readFile('/sys/fs/cgroup/memory.max','utf8')).trim(),node:process.version};
    const entries=[];
    for(const kind of ['asr','tts'] as const) for(const f of MODELS[kind].files) {
      entries.push({cache:'speech-research-'+kind,key:kind==='asr'?modelURL(MODELS.asr,f.path):origin+`/models/tts/${f.path}`,url:`/models/${kind}/${f.path}`});
    }
    for(const name of ['he_IL-noa-medium.onnx','he_IL-noa-medium.onnx.json'])entries.push({cache:'speech-research-tts',key:origin+'/models/piper/'+name,url:'/models/piper/'+name});
    await page.evaluate(async entries=>{for(const e of entries){const response=await fetch(e.url);if(!response.ok)throw new Error('Local fixture '+e.url);await(await caches.open(e.cache)).put(e.key,response);}},entries);
    async function worker(key:string,payload:object,file?:string) {
      return page.evaluate(async({key,payload,file})=>{
        const scope=window as any;scope.workers ||= {};scope.frames=[];
        const w:Worker=scope.workers[key] ||= new Worker(file!,{type:'module'});
        return new Promise<any>((resolve,reject)=>{
          const timeout=setTimeout(()=>{w.terminate();delete scope.workers[key];reject(new Error('Worker timeout'));},180000);
          w.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message));};
          w.onmessage=({data})=>{if(data.type==='audio'){scope.frames.push(data.pcm);return;}clearTimeout(timeout);resolve(data);};
          w.postMessage(payload);
        });
      },{key,payload,file});
    }
    async function terminate(key:string){await page.evaluate(key=>{(window as any).workers?.[key]?.terminate();delete (window as any).workers?.[key];(window as any).frames=[];},key);}
    async function loadAsr(){phase='asr-load';const loaded=await worker('asr',{type:'load',spec:{...MODELS.asr,cache:'speech-research-asr',base:modelURL(MODELS.asr,'')}},'/voice/asr-worker.js');report.load.push({engine:'zipformer',...loaded});if(loaded.type==='error')throw new Error(loaded.message);}
    async function pcmFromWav(bytes:Buffer){return page.evaluate(async bytes=>{const scope=window as any;scope.decoder ||= new AudioContext({sampleRate:16000});const data=await scope.decoder.decodeAudioData(Uint8Array.from(bytes).buffer);if(data.sampleRate!==16000||data.numberOfChannels!==1)throw new Error('Unexpected decoded audio format');return Array.from(data.getChannelData(0));},Array.from(bytes));}
    async function transcribe(id:string,reference:string,pcm:Float32Array,details:object,probes:any[]=[]){
      const result=await page.evaluate(async data=>{const scope=window as any;return new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('ASR timeout')),180000);scope.workers.asr.onmessage=({data})=>{clearTimeout(timeout);resolve(data);};scope.workers.asr.postMessage({type:'transcribe',pcm:Float32Array.from(data)});});},Array.from(pcm));
      const row={id,reference,pcmSha256:hash(Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength)),...details,...result,evaluation:result.type==='result'?score(reference,result.text,probes):null};report.asr.push(row);console.log('ASR',id,result.text);await save();
    }
    if(!SMOKE){
      await loadAsr();phase='asr-human';
      for(const sample of human.records){
        const bytes=await readFile(path.join(EXTRA,'human',sample.filename));if(hash(bytes)!==sample.sha256)throw new Error('Human fixture SHA');
        const pcm=Float32Array.from(await pcmFromWav(bytes));
        await transcribe(sample.id+'-clean',sample.text,pcm,{source:'public-human',condition:'clean',gender:sample.gender});
        const stressed=noise(pcm,20,42);await transcribe(sample.id+'-noise20',sample.text,stressed.pcm,{source:'public-human',condition:'white-noise-20dB',gender:sample.gender});
      }
      for(const control of ['silence','noise']){let pcm=new Float32Array(48000);if(control==='noise'){let s=42;pcm=Float32Array.from(pcm,()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return .01*((s>>>0)/4294967296*2-1);});}await transcribe(control,'',pcm,{source:'negative-control',condition:control});}
      await terminate('asr');
    }
    for(const kind of ['pocket','piper']){
      phase=kind+'-load';const loaded=await worker(kind,{type:'load',kind,cache:'speech-research-tts'},'/speech/tts-worker.mjs');report.load.push({engine:kind,...loaded});await save();
      if(loaded.type==='error')continue;
      for(const voice of kind==='pocket'?['omer','liat']:['noa']) for(const c of SMOKE?cases.slice(0,1):cases){
        phase=kind+'-'+voice;const result=await worker(kind,{type:'speak',text:c.text,voice});
        const row={id:c.id,text:c.text,voice,engine:kind,...result};report.tts.push(row);
        if(result.type==='result'){
          const samples=await page.evaluate(()=>{const frames=(window as any).frames as Float32Array[];const result:number[]=[];for(const f of frames)for(const x of f)result.push(x);return result;});
          if(samples.length!==result.samples||!samples.every(Number.isFinite)||!samples.some(x=>Math.abs(x)>1e-5))throw new Error('Invalid generated PCM');
          const bytes=wav(Float32Array.from(samples),result.sampleRate),name=`${kind}-${voice}-${c.id}.wav`;
          await writeFile(path.join(OUT,name),bytes);row.wav={file:name,bytes:bytes.length,sha256:hash(bytes)};
          generated.push({case:c,voice,engine:kind,bytes});
        }
        console.log('TTS',kind,voice,c.id,result.type,result.ms);await save();
      }
      await terminate(kind);
    }
    if(!SMOKE){
      await loadAsr();phase='asr-synthetic-loopback';
      for(let i=0;i<generated.length;i++){
        const g=generated[i],pcm=Float32Array.from(await pcmFromWav(g.bytes));
        for(const snr of [null,20,10]){
          const p=snr===null?pcm:noise(pcm,snr,42+i).pcm;
          await transcribe(`${g.engine}-${g.voice}-${g.case.id}-${snr??'clean'}`,g.case.text,p,{source:'synthetic-loopback',condition:snr===null?'clean':`white-noise-${snr}dB`,engine:g.engine,voice:g.voice,family:g.case.family},g.case.probes||[]);
        }
      }
      for(const kind of ['pocket','piper']){
        phase='combined-'+kind;
        const loaded=await worker(kind,{type:'load',kind,cache:'speech-research-tts'},'/speech/tts-worker.mjs');report.load.push({engine:kind,phase,...loaded});
        if(loaded.type==='ready'){await worker(kind,{type:'speak',text:'הוספתי מים אבל עוד לא ערבבתי.',voice:kind==='pocket'?'omer':'noa'});await memory();}
        await terminate(kind);
      }
    }
    report.completedUtc=new Date().toISOString();report.completed=true;
  } finally {
    clearInterval(timer);await memory();report.memoryScope='One-second sampled whole Chromium process tree. RSS sum double-counts shared pages; PSS apportions shared pages. Includes browser/runtime/workers/cache and fixture transfer; not phone RAM or model-only memory.';
    await save();await context.close();server.closeAllConnections();server.close();await rm(profile,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

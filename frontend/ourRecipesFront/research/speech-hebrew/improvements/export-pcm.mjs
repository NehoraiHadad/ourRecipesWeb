// Rebuild exact old browser input, not a new recognizer or enhancement.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { noise } from '../metrics.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const OLD=path.resolve(ROOT,'..');
const DIR=process.env.SPEECH_PCM_DIR||'/dev/shm/ourrecipes-speech-decoder-input';
const sha=x=>createHash('sha256').update(x).digest('hex');
await mkdir(DIR,{recursive:false});
const unpack=path.join(DIR,'audio');await mkdir(unpack);
execFileSync('python',['-c',`import sys,zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist())
 z.extractall(sys.argv[2])`,path.join(OLD,'evidence/audio-inputs.zip'),unpack]);
const readJson=async name=>JSON.parse(await readFile(path.join(OLD,name),'utf8'));
const baseline=await readJson('evidence/browser-results.json');
const cases=await readJson('cases.json'),human=await readJson('evidence/human-fixtures.json');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local PCM reconstruction</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await mkdtemp('/dev/shm/ourrecipes-pcm-browser-');
const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await context.newPage();const decoded=new Map();const records=[];
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 for(const row of baseline.asr){
  let pcm,fixture,probes=[];
  if(row.source==='negative-control'){
   pcm=new Float32Array(48000);
   if(row.condition==='noise'){let s=42;pcm=Float32Array.from(pcm,()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return .01*((s>>>0)/4294967296*2-1);});}
  }else{
   if(row.source==='public-human'){
    const sample=human.records.find(r=>row.id.startsWith(r.id+'-'));fixture=path.join(unpack,'public-human',sample.filename);
   }else{
    const c=cases.find(c=>row.id.startsWith(`${row.engine}-${row.voice}-${c.id}-`));probes=c.probes||[];
    const tts=baseline.tts.find(r=>r.engine===row.engine&&r.voice===row.voice&&r.id===c.id);
    fixture=path.join(unpack,'generated',tts.wav.file);
   }
   if(!decoded.has(fixture)){
    const bytes=await readFile(fixture);
    decoded.set(fixture,Float32Array.from(await page.evaluate(async bytes=>{
     window.decoder ||= new AudioContext({sampleRate:16000});
     const data=await window.decoder.decodeAudioData(Uint8Array.from(bytes).buffer);
     if(data.sampleRate!==16000||data.numberOfChannels!==1)throw new Error('Unexpected audio');
     return Array.from(data.getChannelData(0));
    },Array.from(bytes))));
   }
   pcm=decoded.get(fixture);
   if(row.condition!=='clean'){
    const snr=Number(row.condition.match(/(\d+)dB/)[1]);
    const index=row.source==='public-human'?-1:baseline.tts.findIndex(r=>fixture.endsWith('/'+r.wav.file));
    pcm=noise(pcm,snr,index===-1?42:42+index).pcm;
   }
  }
  const bytes=Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength);
  if(sha(bytes)!==row.pcmSha256)throw new Error('Input differs from frozen browser run: '+row.id);
  const file=row.id+'.f32';await writeFile(path.join(DIR,file),bytes);
  records.push({id:row.id,file,bytes:bytes.length,sha256:sha(bytes),reference:row.reference,probes,source:row.source,condition:row.condition,
   voice:row.voice||null,family:row.family||null,audioSeconds:pcm.length/16000,browserText:row.text});
 }
 const report={browser:await page.evaluate(()=>navigator.userAgent),allInputHashesMatch:true,records,
  scope:'All170 raw float32 inputs byte-identical to previously measured Chromium run. No inference, enhancement, dictionary or audio upload.'};
 await writeFile(path.join(DIR,'manifest.json'),JSON.stringify(report,null,2));
 await writeFile(path.join(ROOT,'evidence/input-reconstruction.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log('Exact original browser PCM restored:',records.length);
}finally{await context.close();server.closeAllConnections();server.close();await rm(profile,{recursive:true,force:true});}

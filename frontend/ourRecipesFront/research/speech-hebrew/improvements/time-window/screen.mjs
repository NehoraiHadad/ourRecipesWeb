import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {suspect,reconcile} from '../recipe-actions/retry.mjs';
import {score} from '../../metrics.mjs';
import {missing} from '../styles/anchors.mjs';

const [site,dir,out]=process.argv.slice(2);
const verbs=Object.values(JSON.parse(await readFile(new URL('../recipe-actions/hints.json',import.meta.url))));
const {otherVerbs=[],preserveRecipePass=false}=JSON.parse(await readFile(path.join(site,'manifest.json')));
const microphone=process.argv.includes('--mic');
const inputs=JSON.parse(await readFile(path.join(dir,'manifest.json')));
const cases=microphone ? inputs.filter(c=>c.name==='omer-stir-water') : inputs;
const flags=['--no-sandbox'];
let captureMs;
if(microphone){
  assert.equal(cases.length,1);
  const wav=path.join(dir,cases[0].name+'.wav');
  const device=path.join(dir,'microphone.wav');
  captureMs=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',wav]))*1000+650;
  assert(captureMs<14500);
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',wav,'-af','adelay=150:all=1,apad=pad_dur=3',
    '-ar','48000','-ac','1','-c:a','pcm_s16le',device]);
  flags.push('--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+device);
}
const server=spawn('python',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',site],
  {stdio:['ignore','pipe','ignore']});
let browser;
try {
  const [line]=await once(server.stdout,'data');
  const origin='http://127.0.0.1:'+String(line).match(/port (\d+)/)[1];
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:flags});
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',permissions:microphone?['microphone']:[]});
  const denied=[],errors=[];
  await ctx.route('**/*',route=>{
    const req=route.request();
    if(req.method()==='GET' && new URL(req.url()).origin===origin) return route.continue();
    denied.push(req.method()+' '+req.url());return route.abort();
  });
  // Observe actual worker responses without changing the UI or the messages it receives.
  await ctx.addInitScript(()=>{
    window.trace=[];
    window.Worker=class extends Worker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message',({data})=>{
          if(data.type==='result')window.trace.push({text:data.text,sha256:data.inputSha256,decodeMs:data.ms});
        });
      }
    };
  });
  const page=await ctx.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  page.setDefaultTimeout(90000);
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#file').disabled);
  await page.goto(origin);
  await page.locator('#load').click();await ready();
  await page.locator('#recipe').selectOption('pasta');await ready();
  const records=[];
  for(const c of cases){
    await page.evaluate(()=>{window.trace=[];});
    if(microphone){
      await page.locator('#start').click();
      await page.waitForFunction(()=>!document.querySelector('#stop').disabled);
      await page.waitForTimeout(captureMs);
      await page.locator('#stop').click();
    }else await page.locator('#file').setInputFiles(path.join(dir,c.name+'.wav'));
    await ready();
    assert((await page.locator('#status').textContent()).startsWith('הבדיקה הסתיימה'));
    const first=await page.locator('#hinted').textContent(),final=await page.locator('#plain').textContent();
    const timing=await page.locator('#timing').textContent();
    assert(!timing.includes('נקטעה'));
    const trace=await page.evaluate(()=>window.trace);
    if(!microphone)assert.equal(trace[0].sha256,c.sha256);
    assert.equal(trace[0].text,first);
    const needs=suspect(first,verbs,otherVerbs).length>0;
    assert.equal(trace.length>1,needs);
    if(needs) assert.equal(trace[1].sha256,trace[0].sha256);
    const previous=needs?reconcile(first,trace[1].text,verbs,preserveRecipePass ? [] : otherVerbs).text:first;
    const [firstMs,finalMs]=timing.match(/\d+/g).map(Number);
    const values={};
    for(const [key,text] of Object.entries({first,previous,final})) {
      values[key]={text,errors:score(c.reference,text).wordErrors,missing:missing(text,c.critical)};
    }
    const clarify=await page.locator('#clarify').isVisible();
    assert.equal(clarify,suspect(final,verbs,otherVerbs).length>0);
    let manual=null;
    if(!microphone && !otherVerbs.length && (c.name==='omer-stir-water' || c.name==='noa-wet-clean')){
      const keep=c.name==='noa-wet-clean';
      assert(clarify);
      await page.locator(keep?'#keep-word':'#replace-word').click();
      manual=await page.locator('#plain').textContent();
      assert.equal(manual,keep?final:final.replace('יובבתי','ערבבתי'));
      assert.equal(await page.locator('#hinted').textContent(),first);
      assert(await page.locator('#clarify').isHidden());
    }
    if(!otherVerbs.length && c.name==='liat-cloth-water' && clarify){
      await page.locator('#other-word').click();
      await page.locator('#edit-word').fill('הרטבתי');
      await page.locator('#edit-word-form button').click();
      manual=await page.locator('#plain').textContent();
      assert.equal(manual,final.replace('הרטפתי','הרטבתי'));
      assert.equal(await page.locator('#hinted').textContent(),first);
      assert(await page.locator('#clarify').isHidden());
    }
    records.push({...c,...values,firstMs,finalMs,clarify,manual,trace});
  }
  await page.locator('#erase').click();
  assert.equal(await page.locator('#plain').textContent(),'');
  assert(await page.locator('#file').isDisabled());
  assert.deepEqual(denied,[]);assert.deepEqual(errors,[]);
  await writeFile(out,JSON.stringify({browser:browser.version(),physicalPhone:false,microphoneReplay:microphone,denied,errors,records},null,2)+'\n',{flag:'wx'});
}finally{
  try{await browser?.close();}finally{server.kill();}
}

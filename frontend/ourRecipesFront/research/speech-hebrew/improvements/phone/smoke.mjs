import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const server=spawn('python',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',process.argv[2]],{stdio:['ignore','pipe','ignore']});
let browser;
try {
  const [line]=await once(server.stdout,'data');
  const port=String(line).match(/port (\d+)/)[1],origin='http://127.0.0.1:'+port;
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});
  const page=await ctx.newPage();
  const requests=[],errors=[];
  page.on('request',r=>requests.push([r.method(),r.url()]));
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(60000);
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#file').disabled);
  const settled=()=>page.waitForFunction(()=>!document.querySelector('#file').disabled && document.querySelector('#plain').textContent!=='');
  await page.goto(origin);
  const el=id=>page.locator('#'+id);
  await page.waitForFunction(()=>!document.querySelector('#load').disabled);
  assert(!requests.some(([,u])=>u.includes('/models/')||u.includes('/pkg/')));
  let paused;
  const blocked=new Promise(resolve=>{paused=resolve;});
  let release;
  const resume=new Promise(resolve=>{release=resolve;});
  await page.route('**/models/*',async route=>{paused();await resume;await route.abort().catch(()=>{});},{times:1});
  await el('load').click();await blocked;await el('cancel').click();release();
  assert(await el('file').isDisabled());
  await el('load').click();await ready();
  const modelRequests=requests.filter(([,u])=>u.includes('/models/')).length;
  const evidence=JSON.parse(await readFile(path.join(here,'../recipe-hints/replay-results.json'),'utf8')).records;
  const samplePath=process.argv[3];
  const samples=[];
  for (const recipe of ['salad','cookies']){
    if(recipe==='cookies'){
      await el('recipe').selectOption(recipe);
      await ready();
      assert.equal(await el('hinted').textContent(),'');
    }
    await el('file').setInputFiles(samplePath);await settled();
    const fixture='noa-p03-plain-raw';
    const result={recipe,hinted:await el('hinted').textContent(),plain:await el('plain').textContent(),timing:await el('timing').textContent()};
    // The browser decodes WAV with Web Audio; allow resampler spelling variation.
    assert(result.plain.includes('הגזר'));assert(result.timing.includes('מ״ש'));
    result.priorHinted=evidence.find(r=>r.filename===fixture && r.arm==='hints-'+recipe).text;
    assert(result.plain.includes('השוק'));
    assert(result.hinted.includes(recipe==='salad'?'השום':'השוק'));
    samples.push(result);
  }
  await el('start').click();
  await page.waitForFunction(()=>!document.querySelector('#stop').disabled);
  await page.waitForTimeout(900);await el('stop').click();await settled();
  assert.equal(requests.filter(([,u])=>u.includes('/models/')).length,modelRequests);
  await el('erase').click();
  assert(await el('file').isDisabled());assert.equal(await el('plain').textContent(),'');
  assert(await el('load').isEnabled());
  assert.deepEqual(errors,[]);
  assert(requests.every(([m,url])=>m==='GET' && new URL(url).origin===origin));
  console.log(JSON.stringify({browser:browser.version(),physicalPhone:false,syntheticMic:true,samples,uploadRequests:0,
    cancellation:true,modelRefetchDuringReplay:false,erase:true},null,2));
} finally {
  if(browser)await browser.close();
  server.kill();
}

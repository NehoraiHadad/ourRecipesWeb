// Verify offline capture/export with synthetic microphone and a known cooking WAV.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(),'kitchen-smoke-'));
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:[
  '--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const html = await readFile(path.join(here,'capture.html'));
const server = createServer((req,res) => {
  if (req.url !== '/' || req.method !== 'GET') { res.writeHead(404).end(); return; }
  res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:'+server.address().port;
try {
  const ctx = await browser.newContext();
  const remote = [];
  await ctx.route(/^https?:/,route=>{ if (route.request().url()===origin+'/' && route.request().method()==='GET') return route.continue(); remote.push(route.request().url()); return route.abort(); });
  const page = await ctx.newPage();
  await page.goto(origin);
  await page.locator('#speaker').fill('smoke');
  await page.locator('#start').click();
  await page.waitForFunction(()=>!document.getElementById('stop').disabled);
  await page.waitForTimeout(750);
  await page.locator('#stop').click();
  await page.waitForFunction(()=>!document.getElementById('reference').disabled);
  assert(await page.locator('#save').isDisabled());
  await page.locator('#reference').fill('צליל בדיקה');
  async function save(name) {
    const downloaded = page.waitForEvent('download');
    await page.locator('#save').click();
    const output = path.join(dir,name);
    await (await downloaded).saveAs(output);
    return JSON.parse(await readFile(output,'utf8'));
  }
  const captured = await save('fake-mic.json');
  assert(Buffer.from(captured.audioBase64,'base64').length>0);
  await page.locator('#clear').click();
  assert(await page.locator('#listen').isHidden());
  const wav = path.resolve(here,'../../samples/pocket-omer-water-not-mixed.wav');
  await page.locator('#file').setInputFiles(wav);
  await page.locator('#reference').fill('הוספתי מים אבל עוד לא ערבבתי.');
  const imported = await save('import.json');
  assert.deepEqual(Buffer.from(imported.audioBase64,'base64'),await readFile(wav));
  assert.equal(imported.speakerCode,'smoke');
  assert.equal(imported.reference,'הוספתי מים אבל עוד לא ערבבתי.');
  assert.deepEqual(remote,[]);
  console.log(dir);
} finally { await browser.close(); server.close(); }

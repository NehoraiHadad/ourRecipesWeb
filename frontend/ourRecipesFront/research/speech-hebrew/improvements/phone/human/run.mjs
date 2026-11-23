import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {score, normalize} from '../../../metrics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = '/dev/shm/kitchen-phone-dev-he';
const site = process.argv[2];
const waterTrial = process.argv[3] === '--water';
assert(site, 'Pass the built probe directory');
const fixtures = JSON.parse(await readFile(path.join(here,'fixtures.json'))).records;
const microphone = fixtures.find(r => r.file === '671253326365773738.wav');
const micPath = path.join(cache,'fake-mic.wav');
for (const item of fixtures) {
  const data = await readFile(path.join(cache, item.file));
  assert.equal(createHash('sha256').update(data).digest('hex'), item.sha256);
}
execFileSync('ffmpeg',['-loglevel','error','-y','-i',path.join(cache,microphone.file),
  '-af','adelay=150:all=1,apad=pad_dur=3','-ar','48000','-ac','1','-c:a','pcm_s16le',micPath]);
const recipeOf = {'1602':'salad','1620':'cookies'};
function assess(item, transcript) {
  const {wordErrors, referenceWords, negationCountDelta} = score(item.reference, transcript);
  const words = normalize(transcript).split(' ');
  const target = {'1602': /^(?:ה|ב|ל|מ|ו|וה)?שמן$/, '1620': /^(?:ה|ב|ל|מ|ו|וה)?סוכר$/}[item.source_id];
  return {transcript, wordErrors, referenceWords, negationCountDelta,
    ingredientMentions: target ? words.filter(w => target.test(w)).length : null};
}
const server = spawn('python',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',site],
  {stdio:['ignore','pipe','ignore']});
let browser;
try {
  const [line] = await once(server.stdout,'data');
  const origin = 'http://127.0.0.1:'+String(line).match(/port (\d+)/)[1];
  browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox',
    '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+micPath]});
  const ctx = await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});
  const rejected = [], errors = [];
  await ctx.route('**/*', async route => {
    const req = route.request();
    if (req.method() === 'GET' && new URL(req.url()).origin === origin) return route.continue();
    rejected.push(req.method()+' '+req.url());
    await route.abort();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.on('pageerror',err=>errors.push(err.message));
  const el = id => page.locator('#'+id);
  const ready = () => page.waitForFunction(()=>!document.querySelector('#file').disabled);
  await page.goto(origin);
  await el('load').click();
  await ready();
  const runs = [];
  async function compare(item, recipe, input, mix) {
    if (await el('recipe').inputValue() !== recipe) {
      await el('recipe').selectOption(recipe);
      await ready();
    }
    if (input === 'microphone-replay') {
      await el('start').click();
      await page.waitForFunction(()=>!document.querySelector('#stop').disabled);
      await page.waitForTimeout((microphone.seconds+0.65)*1000);
      await el('stop').click();
    } else {
      await el('file').setInputFiles(path.join(cache,mix?.file ?? item.file));
    }
    await ready();
    assert((await el('status').textContent()).startsWith('ההשוואה הסתיימה'));
    const timing = (await el('timing').textContent()).match(/\d+/g).map(Number);
    assert.equal(timing.length, 3);
    const [firstVisibleMs,hintedDecodeMs,plainDecodeMs] = timing;
    runs.push({file:item.file, source_id:item.source_id, input, recipe, mix,
      hinted:assess(item,await el('hinted').textContent()), plain:assess(item,await el('plain').textContent()),
      firstVisibleMs,hintedDecodeMs,plainDecodeMs});
    console.log(input,item.file,recipe,firstVisibleMs);
  }
  if (waterTrial) {
    const mixes = JSON.parse(await readFile(path.join(cache,'water.json')));
    for (const mix of mixes) {
      const data = await readFile(path.join(cache,mix.file));
      assert.equal(createHash('sha256').update(data).digest('hex'), mix.sha256);
      const item = fixtures.find(f => f.file === mix.sourceFile);
      await compare(item,recipeOf[item.source_id] ?? 'salad','file',mix);
    }
    assert.equal(runs.length,8);
  } else {
    for (const recipe of ['salad','cookies']) {
      for (const item of fixtures) {
        if (recipe === 'cookies' && !recipeOf[item.source_id]) continue;
        await compare(item, recipe,'file');
      }
    }
    await compare(microphone,recipeOf[microphone.source_id],'microphone-replay');
    assert.equal(runs.length,20);
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(rejected,[]);
  const result = {browser:browser.version(),platform:process.platform,physicalPhone:false,
    manifestSha256:createHash('sha256').update(await readFile(path.join(site,'manifest.json'))).digest('hex'),
    rejectedRequests:rejected, pageErrors:errors, runs};
  await writeFile(path.join(here,waterTrial ? 'water-results.json' : 'results.json'),JSON.stringify(result,null,2)+'\n');
} finally {
  try {await browser?.close();} finally {server.kill();}
}

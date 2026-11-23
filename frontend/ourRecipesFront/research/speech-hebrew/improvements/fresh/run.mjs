// Run both decoders sequentially on the same frozen float32 PCM. No microphone.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { score } from '../../metrics.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const cache = process.env.SPEECH_NEW_CACHE || '/dev/shm/ourrecipes-fresh-he';
const model = process.env.SPEECH_ASR || '/tmp/voice-models/asr/sherpa-onnx';
const pkg = process.env.SPEECH_WASM || '/dev/shm/ourrecipes-speech-wasm/sherpaw-asr';
const manifest = JSON.parse(await readFile(process.env.SPEECH_MANIFEST || join(root, 'manifest.json')));
const sources = JSON.parse(await readFile(join(root, '../evidence/wasm-source.json')));
const modelSources = JSON.parse(await readFile(join(root, '../evidence/protocol.json')));
const whisper = process.env.SPEECH_WHISPER_TINY === '1';
const hebrewExport = process.env.SPEECH_WHISPER_HE === '1';
assert(!(whisper && hebrewExport), 'Select one candidate per process');
const workerFile = hebrewExport ? '../whisper/he-worker.mjs' : whisper ? '../whisper/worker.mjs' : '../browser-worker.mjs';
const files = new Map([['/worker.mjs', resolve(root, workerFile)]]);
const sha = data => createHash('sha256').update(data).digest('hex');

for (const [name, metadata] of Object.entries(sources.files)) {
  if (!name.startsWith('dist/')) continue;
  const file = join(pkg, name);
  assert.equal(sha(await readFile(file)), metadata.sha256);
  files.set('/pkg/' + name.slice(5), file);
}
if (hebrewExport) {
  const cacheDir='/dev/shm/ourrecipes-whisper-he';
  for (const name of ['transformers.min.js','ort-wasm-simd-threaded.jsep.wasm','ort-wasm-simd-threaded.jsep.mjs']) {
    files.set('/dist/'+name, join(cacheDir,'dist',name));
  }
  const source=JSON.parse(await readFile(resolve(root,'../whisper/he-source.json')));
  for (const entry of source.files) {
    const name=(entry.rfilename.endsWith('.onnx')?'onnx/':'')+entry.rfilename;
    const file=join(cacheDir,'model',name);
    const bytes=await readFile(file);
    assert.equal(bytes.length,entry.size);
    if (entry.lfs) assert.equal(sha(bytes),entry.lfs.sha256);
    else assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.blobId);
    files.set('/model/'+name,file);
  }
} else if (whisper) {
  const source = JSON.parse(await readFile(resolve(root,'../whisper/source.json')));
  for (const entry of source.files) {
    const file = join('/dev/shm/ourrecipes-whisper-tiny',entry.rfilename);
    const bytes = await readFile(file);
    assert.equal(bytes.length,entry.size);
    if (entry.lfs) assert.equal(sha(bytes),entry.lfs.sha256);
    else assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.blobId);
    files.set('/models/'+entry.rfilename,file);
  }
} else for (const [name, metadata] of Object.entries(modelSources.models)) {
  if (!name.startsWith('asr/sherpa-onnx/')) continue;
  const basename = name.split('/').pop();
  const file = join(model, basename);
  assert.equal(sha(await readFile(file)), metadata.sha256);
  files.set('/models/' + basename, file);
}
const recipeHints = process.env.SPEECH_RECIPE_HINTS === '1';
if (recipeHints) {
  assert(!whisper && !hebrewExport);
  for (const file of ['bpe.vocab','salad.txt','cookies.txt']) files.set('/hints/'+file,join(cache,file));
}
for (const row of manifest.records) {
  const file = join(cache, row.filename + '.pcm');
  assert.equal(sha(await readFile(file)), row.pcm_sha256);
  files.set('/audio/' + row.filename, file);
}

const out = process.env.SPEECH_RESULT || join(root, 'results.json');
try { await stat(out); throw new Error('Choose a fresh SPEECH_RESULT path'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const assetsServed = new Map();
const server = createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'content-type': 'text/html'}).end('<title>Local ASR evaluation</title>');
    return;
  }
  const file = files.get(req.url);
  if (!file) { res.writeHead(404).end(); return; }
  if(hebrewExport && !req.url.startsWith('/audio/')) assetsServed.set(req.url,(await stat(file)).size);
  const type = file.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
  try { res.writeHead(200, {'content-type': type}).end(await readFile(file)); }
  catch { res.destroy(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const records = [], loads = [];
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox']});
try {
  const context = await browser.newContext({serviceWorkers: 'block'});
  const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin);
  let arms = recipeHints ? ['greedy','beam4','hints-salad','hints-cookies'] : hebrewExport ? ['whisper-he'] : whisper ? ['whisper-tiny'] : process.env.SPEECH_GREEDY_ONLY === '1' ? ['greedy'] : ['greedy', 'beam4'];
  if (process.env.SPEECH_HINT_ARM) {
    assert(recipeHints && ['hints-salad','hints-cookies'].includes(process.env.SPEECH_HINT_ARM));
    arms = [process.env.SPEECH_HINT_ARM];
  }
  for (const arm of arms) {
    const loaded = await page.evaluate(async arm => {
      window.worker = new Worker('/worker.mjs', {type: 'module'});
      window.ask = payload => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker timeout')), 120000);
        window.worker.onerror = e => {clearTimeout(timer); reject(new Error(e.message));};
        window.worker.onmessage = ({data}) => {
          clearTimeout(timer);
          if (data.type === 'error') reject(new Error(data.error));
          else resolve(data);
        };
        window.worker.postMessage(payload);
      });
      return window.ask({type: 'load', arm});
    }, arm);
    assert.equal(loaded.type, 'ready');
    loads.push({arm,ms:loaded.ms,heapBytes:loaded.wasmHeapBytes});
    for (const row of manifest.records) {
      const result = await page.evaluate(async filename => {
        const response = await fetch('/audio/' + filename);
        if (!response.ok) throw new Error('Missing audio');
        return window.ask({type: 'transcribe', pcm: new Float32Array(await response.arrayBuffer())});
      }, row.filename);
      assert.equal(result.inputSha256, row.pcm_sha256);
      records.push({arm, filename: row.filename, text: result.text, ms: result.ms, pcm_sha256: result.inputSha256,
        metrics: score(row.reference, result.text, [])});
    }
    await page.evaluate(() => window.worker.terminate());
    console.log('Completed', arm, manifest.records.length);
  }
  assert.deepEqual(external, []);
  await writeFile(out, JSON.stringify({browser: browser.version(), loads, ...(hebrewExport ? {assetsServed:Object.fromEntries(assetsServed)} : {}), externalRequests: external, records}, null, 2) + '\n', {flag: 'wx'});
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}

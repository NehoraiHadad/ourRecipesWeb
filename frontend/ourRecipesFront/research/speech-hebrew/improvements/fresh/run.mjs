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
const files = new Map([['/worker.mjs', resolve(root, '../browser-worker.mjs')]]);
const sha = data => createHash('sha256').update(data).digest('hex');

for (const [name, metadata] of Object.entries(sources.files)) {
  if (!name.startsWith('dist/')) continue;
  const file = join(pkg, name);
  assert.equal(sha(await readFile(file)), metadata.sha256);
  files.set('/pkg/' + name.slice(5), file);
}
for (const [name, metadata] of Object.entries(modelSources.models)) {
  if (!name.startsWith('asr/sherpa-onnx/')) continue;
  const basename = name.split('/').pop();
  const file = join(model, basename);
  assert.equal(sha(await readFile(file)), metadata.sha256);
  files.set('/models/' + basename, file);
}
for (const row of manifest.records) {
  const file = join(cache, row.filename + '.pcm');
  assert.equal(sha(await readFile(file)), row.pcm_sha256);
  files.set('/audio/' + row.filename, file);
}

const out = process.env.SPEECH_RESULT || join(root, 'results.json');
try { await stat(out); throw new Error('Choose a fresh SPEECH_RESULT path'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const server = createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'content-type': 'text/html'}).end('<title>Local ASR evaluation</title>');
    return;
  }
  const file = files.get(req.url);
  if (!file) { res.writeHead(404).end(); return; }
  const type = file.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
  try { res.writeHead(200, {'content-type': type}).end(await readFile(file)); }
  catch { res.destroy(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const records = [];
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
  for (const arm of (process.env.SPEECH_GREEDY_ONLY === '1' ? ['greedy'] : ['greedy', 'beam4'])) {
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
  await writeFile(out, JSON.stringify({browser: browser.version(), externalRequests: external, records}, null, 2) + '\n', {flag: 'wx'});
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}

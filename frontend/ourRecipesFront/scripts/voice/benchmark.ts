/** Real model inference in headless Chromium; NOT a physical-device/microphone test. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { MODELS, modelCacheName, modelURL } from '../../src/lib/voice/models';
import { makeCookingRecipe, initialCookingState, cookingPrompt, validateProposal, updateActions, type CookingState } from '../../src/lib/voice/cookingState';

async function main() {
  const kinds = (process.env.VOICE_BENCH_KINDS || 'asr,llm').split(',') as ('asr' | 'llm')[];
  const fixtureDir = process.env.VOICE_MODEL_DIR || '/tmp/voice-models';
  for (const spec of kinds.map(k => MODELS[k])) for (const f of spec.files) {
    const file = path.join(fixtureDir, spec.kind, f.path);
    if ((await stat(file)).size !== f.bytes) throw new Error(`Missing/incomplete pinned fixture: ${file}. See docs/VOICE_POC.md.`);
  }
  const server = createServer(async (req, res) => {
    try {
      const relative = decodeURIComponent(req.url || '').replace(/^\//, '');
      const filename = path.resolve(fixtureDir, relative);
      if (!filename.startsWith(path.resolve(fixtureDir) + path.sep)) { res.writeHead(403).end(); return; }
      const data = await readFile(filename);
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': data.length }); res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const profile = await mkdtemp('/tmp/ourrecipes-voice-browser-');
  const browser = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const output: Record<string, unknown> = { date: new Date().toISOString(), environment: 'cloud Chromium, headless, WASM 1 thread, no physical mic/speaker', cachePopulation: 'local fixture HTTP; excluded from download latency', models: MODELS, requests: [] };
  const memory: { elapsedMs: number; sumRssMiB: number }[] = [];
  const measurementStart = Date.now();
  const sampleMemory = () => {
    const lines = execFileSync('ps', ['-eo', 'rss,args'], { encoding: 'utf8' }).split('\n').filter(line => line.includes(`--user-data-dir=${profile}`));
    memory.push({ elapsedMs: Date.now() - measurementStart, sumRssMiB: lines.reduce((sum, line) => sum + Number(line.trim().split(/\s+/)[0]), 0) / 1024 });
  };
  sampleMemory(); const sampleTimer = setInterval(sampleMemory, 2000);
  const requests: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://localhost:') && !request.url().startsWith('http://127.0.0.1:')) requests.push(request.url()); });
  try {
    await page.goto(process.env.VOICE_LAB_URL || 'http://localhost:3000/voice-lab');
    await page.getByRole('heading', { name: 'עוזר בישול בעברית · ניסוי מקומי' }).waitFor();
    output.browser = await page.evaluate(() => ({ userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, localHebrewVoices: speechSynthesis.getVoices().filter(v => v.localService && /^(he|iw)(-|$)/i.test(v.lang)).map(v => v.name) }));
    for (const spec of kinds.map(k => MODELS[k])) {
      console.log(`Populating ${spec.kind} cache from local fixtures`);
      await page.evaluate(async ({ spec, cacheName, base, port }) => {
        const cache = await caches.open(cacheName);
        for (const f of spec.files) {
          const response = await fetch(`http://127.0.0.1:${port}/${spec.kind}/${f.path}`);
          if (!response.ok) throw new Error('fixture failed');
          await cache.put(base + f.path, response);
        }
      }, { spec, cacheName: modelCacheName(spec), base: modelURL(spec, ''), port });
    }
    const callWorker = async (kind: 'asr' | 'llm', payload: object) => await page.evaluate(async ({ kind, payload }) => {
      const scope = window as typeof window & { voiceBench?: Partial<Record<string, Worker>> };
      scope.voiceBench ||= {};
      const worker = scope.voiceBench[kind] ||= new Worker(`/voice/${kind}-worker.js`, { type: 'module' });
      return await new Promise<Record<string, any>>((resolve, reject) => {
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('benchmark timeout')); }, 180000);
        worker.onmessage = ({ data }) => { if (data.type === 'progress') { console.log('first token', data.firstTokenMs); return; } clearTimeout(timer); resolve(data); };
        worker.onerror = e => { clearTimeout(timer); reject(new Error(e.message)); };
        worker.postMessage(payload);
      });
    }, { kind, payload });
    for (const kind of kinds) {
      const spec = MODELS[kind];
      const loaded = await callWorker(kind, { type: 'load', spec: { ...spec, cache: modelCacheName(spec), base: modelURL(spec, '') } });
      output[`${kind}Load`] = loaded; console.log(kind, 'load', loaded);
      if (loaded.type === 'error') { process.exitCode = 2; continue; }
      if (kind === 'asr') {
        output.asrSilence = await page.evaluate(async () => {
          const worker = (window as any).voiceBench.asr as Worker;
          return await new Promise(resolve => { worker.onmessage = ({ data }) => resolve(data); worker.postMessage({ type: 'transcribe', pcm: new Float32Array(16000 * 3) }); });
        });
        if (process.env.VOICE_WAV) {
          const wav = Array.from(await readFile(process.env.VOICE_WAV));
          output.asrRecordedFixture = await page.evaluate(async wav => {
            const context = new AudioContext();
            const decoded = await context.decodeAudioData(Uint8Array.from(wav).buffer);
            const resample = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
            const source = resample.createBufferSource(); source.buffer = decoded; source.connect(resample.destination); source.start();
            const pcm = new Float32Array((await resample.startRendering()).getChannelData(0)); await context.close();
            const worker = (window as any).voiceBench.asr as Worker;
            return await new Promise(resolve => { worker.onmessage = ({ data }) => resolve(data); worker.postMessage({ type: 'transcribe', pcm }); });
          }, wav);
        }
        console.log('ASR', output.asrSilence, output.asrRecordedFixture);
      } else {
        const recipe = makeCookingRecipe('lab-0', 'דוגמת בדיקה: בצק', ['קמח', 'מים'], 'להוסיף קמח\nלהוסיף מים ולערבב\nללוש את הבצק');
        const initial = initialCookingState(recipe);
        const afterFlour = updateActions(recipe, initial, [{ actionId: 's0a0', done: true }]);
        const cases: { text: string; state: CookingState; expected: string; previous?: string }[] = [
          { text: 'שמתי קמח, מה עכשיו?', state: initial, expected: 'report:s0a0=true' },
          { text: 'הוספתי מים אבל עוד לא ערבבתי', state: afterFlour, expected: 'report:s1a0=true,s1a1=false' },
          { text: 'תיקון, לא שמתי קמח', state: afterFlour, expected: 'report:s0a0=false', previous: 'שמתי קמח' },
          { text: 'עשיתי את זה', state: afterFlour, expected: 'clarify' },
          { text: 'על איזה שלב דילגתי?', state: { ...afterFlour, currentStep: 2 }, expected: 'missed' },
          { text: 'כמה שמן להוסיף?', state: initial, expected: 'advice' },
        ];
        const results = [];
        for (const c of cases) {
          let result: Record<string, any>;
          try { result = await callWorker('llm', { type: 'generate', messages: cookingPrompt(recipe, c.state, c.text, c.previous || null) }); }
          catch (e) { results.push({ input: c.text, expected: c.expected, pass: false, status: 'timeout-or-worker-failure', limitMs: 180000, error: String(e) }); break; }
          let valid = false, actual = '', error = '';
          try {
            const p = validateProposal(JSON.parse(result.text), recipe, c.state, c.text);
            valid = true; actual = p.intent + (p.changes.length ? ':' + p.changes.map(x => `${x.actionId}=${x.done}`).join(',') : '');
          } catch (e) { error = String(e); }
          const row = { input: c.text, expected: c.expected, actual, valid, pass: valid && actual === c.expected, ...result, error };
          results.push(row); console.log(JSON.stringify(row));
        }
        output.llmCases = results;
        output.llmCaseSummary = { planned: cases.length, completed: results.filter(r => 'type' in r && r.type === 'result').length, passed: results.filter(r => r.pass).length };
        if (results.length !== cases.length || results.some(r => !r.pass)) process.exitCode = 2;
      }
    }
    output.requests = requests;
    output.rendererHeap = await page.evaluate(() => (performance as any).memory ? { usedJSHeapSize: (performance as any).memory.usedJSHeapSize, note: 'renderer JS heap only; excludes Worker/WASM/native allocations' } : null);
    await page.screenshot({ path: '/tmp/voice-benchmark.png', fullPage: true });
  } finally {
    clearInterval(sampleTimer); sampleMemory(); output.requests = requests;
    output.processMemory = { samples: memory, peakSumRssMiB: Math.max(...memory.map(m => m.sumRssMiB)), note: 'Sum of RSS of Chromium processes with this profile; shared pages counted multiple times; includes browser/app/workers/native/WASM, not model-only memory.' };
    await writeFile(process.env.VOICE_BENCH_OUTPUT || '/tmp/voice-benchmark.json', JSON.stringify(output, null, 2));
    await browser.close(); server.close(); await rm(profile, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

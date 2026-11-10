/** Actual browser PCM playback/cancel; cloud audio sink, no physical speaker. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fixtureServer } from './fixture-server';
import { MODELS, modelCacheName, modelURL } from '../../src/lib/voice/models';
async function main() {
  const profile = await mkdtemp('/tmp/ourrecipes-playback-');
  const { server, url } = await fixtureServer(process.env.VOICE_MODEL_DIR || '/tmp/voice-models', process.env.VOICE_LAB_URL || 'http://localhost:3000/voice-lab');
  const context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await context.newPage();
  const external: string[] = [];
  page.on('request', req => { if (/^https?:\/\//.test(req.url()) && new URL(req.url()).origin !== url) external.push(req.url()); });
  await page.addInitScript(() => {
    const scope = window as any; scope.playbackStats = { starts: 0, stops: 0 };
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = original.call(this); const start = source.start.bind(source); const stop = source.stop.bind(source);
      source.start = (...args: Parameters<typeof source.start>) => { scope.playbackStats.starts++; start(...args); };
      source.stop = (...args: Parameters<typeof source.stop>) => { scope.playbackStats.stops++; stop(...args); };
      return source;
    };
  });
  try {
    await page.goto(url + '/voice-lab');
    for (const kind of ['asr', 'tts', 'llm'] as const) {
      const spec = MODELS[kind];
      await page.evaluate(async ({ spec, cacheName, base }) => {
        const cache = await caches.open(cacheName);
        for (const f of spec.files) await cache.put(base + f.path, await fetch(`/fixtures/${spec.kind}/${f.path}`));
      }, { spec, cacheName: modelCacheName(spec), base: modelURL(spec, '') });
    }
    await page.reload();
    await page.getByLabel('בדקתי את חלוקת הפעולות').check();
    await page.getByLabel('סוג הקראה').selectOption('pocket');
    await page.getByRole('button', { name: 'מה עכשיו?', exact: true }).click();
    await page.getByRole('button', { name: 'הקראת התשובה', exact: true }).click();
    await page.waitForFunction(() => (window as any).playbackStats.starts > 0, { timeout: 45000 });
    assert(await page.getByRole('button', { name: 'הקלטה עד 20 שניות' }).isDisabled());
    await page.getByRole('button', { name: 'עצירת הקראה', exact: true }).click();
    assert(await page.getByRole('button', { name: 'עצירת הקראה', exact: true }).isDisabled());
    assert((await page.evaluate(() => (window as any).playbackStats.stops)) > 0);
    // Let a complete real model synthesis drain through the browser clock.
    await page.getByRole('button', { name: 'הקראת התשובה', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('tts:first-pcm'), { timeout: 45000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'עצירת הקראה')?.disabled, { timeout: 30000 });
    // Changing recipe must stop a new stream and reset cooking progress.
    const starts = await page.evaluate(() => (window as any).playbackStats.starts);
    await page.getByRole('button', { name: 'הקראת התשובה', exact: true }).click();
    await page.waitForFunction(n => (window as any).playbackStats.starts > n, starts);
    await page.getByLabel('דוגמה לבדיקה', { exact: true }).selectOption('1');
    assert(await page.getByRole('button', { name: 'עצירת הקראה', exact: true }).isDisabled());
    assert.match(await page.locator('main').innerText(), /הושלמו 0/);
    // Real LLM cancellation: wait until the nested inference engine is loaded,
    // then cancel its pending completion without waiting for generated output.
    await page.getByLabel('בדקתי את חלוקת הפעולות').check();
    await page.getByLabel('מה עשית או מה רצית לשאול?').fill('חתכתי עגבנייה');
    await page.getByRole('button', { name: 'שליחה לעוזר המקומי', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('pre')?.textContent?.includes('llm:load'), { timeout: 45000 });
    await page.getByRole('button', { name: 'ביטול ושחרור זיכרון', exact: true }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'שליחה לעוזר המקומי')?.disabled);
    assert.match(await page.locator('main').innerText(), /הושלמו 0/);
    await page.getByRole('button', { name: 'מחיקת כל המודלים מהדפדפן', exact: true }).click();
    await page.waitForFunction(async () => !(await caches.keys()).some(k => k.startsWith('ourrecipes-voice-')));
    assert.deepEqual(external, []);
    const stats = await page.evaluate(() => (window as any).playbackStats);
    await writeFile('/tmp/voice-playback-smoke.json', JSON.stringify({ date: new Date().toISOString(), environment: 'headless cloud Chromium, actual model/AudioContext, no physical audio device', checks: ['actual PCM scheduled', 'microphone disabled during speech', 'stop cancels PCM', 'full playback drains', 'recipe switch cancels', 'actual LLM inference cancelled without state change', 'model cache deletion', 'zero external requests'], stats }, null, 2));
    console.log('PASS: actual Pocket PCM playback, half duplex, stop, recipe switch, delete, zero external requests');
  } finally { await context.close(); server.closeAllConnections(); server.close(); await rm(profile, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

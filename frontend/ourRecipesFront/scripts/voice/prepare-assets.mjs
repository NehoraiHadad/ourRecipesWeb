// Self-host every executable inference asset, with its matching WASM version.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const pocketRoot = dirname(require.resolve('pocket-tts-onnx/package.json'));
const pocketRequire = createRequire(join(pocketRoot, 'package.json'));
const roots = {
  asr: dirname(dirname(require.resolve('onnxruntime-web'))),
  tts: dirname(dirname(pocketRequire.resolve('onnxruntime-web'))),
};
for (const [kind, root] of Object.entries(roots)) {
  const target = `public/voice/runtime/${kind}`;
  await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true });
  for (const file of await readdir(join(root, 'dist'))) {
    if (file === 'ort.wasm.min.mjs' || /^ort-wasm-simd-threaded(?:\.\w+)?\.(mjs|wasm)$/.test(file)) await copyFile(join(root, 'dist', file), join(target, file));
  }
}
const llmRoot = dirname(dirname(require.resolve('@wllama/wllama')));
await rm('public/voice/runtime/llm', { recursive: true, force: true }); await mkdir('public/voice/runtime/llm', { recursive: true });
await copyFile(join(llmRoot, 'esm/wasm/wllama.wasm'), 'public/voice/runtime/llm/wllama.wasm');
await copyFile(join(llmRoot, 'LICENCE'), 'public/voice/runtime/llm/LICENSE');
await copyFile(join(pocketRoot, 'LICENSE'), 'public/voice/runtime/tts/LICENSE');
await build({ entryPoints: [join(llmRoot, 'esm/index.js')], outfile: 'public/voice/runtime/llm/wllama.js', bundle: true, format: 'esm', platform: 'browser', minify: true });
await build({ stdin: { contents: `export { PocketTTS } from '${pocketRoot}/dist/tts.js'; export { HebrewG2P } from '${pocketRoot}/dist/g2p.js'; export { resolveOptions } from '${pocketRoot}/dist/options.js';`, resolveDir: process.cwd() }, outfile: 'public/voice/runtime/tts/pocket.js', bundle: true, format: 'esm', platform: 'browser', minify: true });

// Self-host all executable inference assets. No runtime CDN or analytics.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const tfRoot = dirname(dirname(require.resolve('@huggingface/transformers')));
const tfRequire = createRequire(join(tfRoot, 'package.json'));
const roots = {
  asr: dirname(dirname(require.resolve('onnxruntime-web'))),
  llm: dirname(dirname(tfRequire.resolve('onnxruntime-web'))),
};
for (const [kind, root] of Object.entries(roots)) {
  const target = `public/voice/runtime/${kind}`;
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of await readdir(join(root, 'dist'))) {
    if (['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.jspi.mjs', 'ort-wasm-simd-threaded.jspi.wasm'].includes(file)) await copyFile(join(root, 'dist', file), join(target, file));
  }
}
await copyFile(join(tfRoot, 'dist/transformers.min.js'), 'public/voice/runtime/llm/transformers.js');

await copyFile(join(tfRoot, 'LICENSE'), 'public/voice/runtime/llm/TRANSFORMERS_LICENSE');

export type ModelKind = 'asr' | 'llm';
export interface ModelSpec { kind: ModelKind; repo: string; revision: string; license: string; files: { path: string; bytes: number }[] }
export const MODELS: Record<ModelKind, ModelSpec> = {
  asr: {
    kind: 'asr', repo: 'ivrit-ai/zipformer2-66m-streaming-he', revision: 'ee769a2a13b887f91572eec349458bfb0fe79e7a', license: 'CC-BY-4.0 — Yakov Kolani; ONNX exports: ivrit.ai',
    files: [
      { path: 'onnx/config.json', bytes: 10365 }, { path: 'sherpa-onnx/tokens.txt', bytes: 17086 },
      { path: 'sherpa-onnx/encoder.int8.onnx', bytes: 70478964 }, { path: 'sherpa-onnx/decoder.int8.onnx', bytes: 1049105 }, { path: 'sherpa-onnx/joiner.int8.onnx', bytes: 771805 },
    ],
  },
  llm: {
    kind: 'llm', repo: 'onnx-community/Qwen3-0.6B-ONNX', revision: '58ca03a5e7b354b480b1a82b34bde8dc7b854cc0', license: 'Apache-2.0 — Qwen; ONNX: ONNX Community',
    files: [
      { path: 'config.json', bytes: 912 }, { path: 'generation_config.json', bytes: 219 },
      { path: 'tokenizer.json', bytes: 9117040 }, { path: 'tokenizer_config.json', bytes: 10369 },
      { path: 'onnx/model_q4.onnx', bytes: 919096585 },
    ],
  },
};
export const modelCacheName = (spec: ModelSpec) => `ourrecipes-voice-${spec.kind}-${spec.revision}`;
export const modelURL = (spec: ModelSpec, path: string) => `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/${path}`;
export const modelBytes = (spec: ModelSpec) => spec.files.reduce((n, f) => n + f.bytes, 0);

// Called only from an explicit download button. No audio/text leaves the device.
export async function downloadModel(spec: ModelSpec, signal: AbortSignal, progress: (bytes: number) => void) {
  const cache = await caches.open(modelCacheName(spec));
  let loaded = 0;
  for (const file of spec.files) {
    signal.throwIfAborted();
    const url = modelURL(spec, file.path);
    const hit = await cache.match(url);
    if (hit && Number(hit.headers.get('content-length')) === file.bytes) { loaded += file.bytes; progress(loaded); continue; }
    const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok || !response.body) throw new Error(`הורדת מודל נכשלה (${response.status})`);
    const reader = response.body.getReader();
    const buffer = new Uint8Array(file.bytes);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > buffer.length) throw new Error('גודל קובץ המודל השתנה. ההורדה הופסקה.');
        buffer.set(value, offset); offset += value.length; progress(loaded + offset);
      }
      signal.throwIfAborted();
      if (offset !== file.bytes) throw new Error('הורדה חלקית. ניתן לנסות שוב.');
      await cache.put(url, new Response(buffer, { headers: { 'content-length': String(file.bytes) } }));
      signal.throwIfAborted();
      loaded += offset;
    } finally { reader.releaseLock(); }
  }
}
export async function hasModel(spec: ModelSpec) {
  const cache = await caches.open(modelCacheName(spec));
  const matches = await Promise.all(spec.files.map(async f => Number((await cache.match(modelURL(spec, f.path)))?.headers.get('content-length')) === f.bytes));
  return matches.every(Boolean);
}
export async function deleteModels() {
  // Also delete earlier revisions belonging to this feature, never other app caches.
  for (const key of await caches.keys()) if (key.startsWith('ourrecipes-voice-')) await caches.delete(key);
}

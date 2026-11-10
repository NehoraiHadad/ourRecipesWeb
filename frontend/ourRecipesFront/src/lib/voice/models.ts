export type ModelKind = 'asr' | 'llm' | 'tts';
export interface ModelSpec { kind: ModelKind; repo: string; revision: string; license: string; files: { path: string; bytes: number }[] }
export const DICTA_MODEL: ModelSpec = {
  kind: 'llm', repo: 'EMD123/DictaLM-3.0-1.7B-Instruct-Q4_K_M-GGUF', revision: '2f41ecf9bdeb2d75ff4dd85266970402c59c14d8', license: 'Apache-2.0 — Dicta; community GGUF: EMD123',
  files: [{ path: 'dictalm-3.0-1.7b-instruct-q4_k_m.gguf', bytes: 1107404704 }],
};
// Measured lab candidates. None has passed the production quality/latency gate.
export const QWEN35_MODEL: ModelSpec = {
  kind: 'llm', repo: 'unsloth/Qwen3.5-0.8B-GGUF', revision: '6ab461498e2023f6e3c1baea90a8f0fe38ab64d0', license: 'Apache-2.0 — Qwen; GGUF: Unsloth',
  files: [{ path: 'Qwen3.5-0.8B-Q4_K_M.gguf', bytes: 532517120 }],
};
export const QWEN35_2B_MODEL: ModelSpec = {
  kind: 'llm', repo: 'unsloth/Qwen3.5-2B-GGUF', revision: 'f6d5376be1edb4d416d56da11e5397a961aca8ae', license: 'Apache-2.0 — Qwen; GGUF: Unsloth',
  files: [{ path: 'Qwen3.5-2B-Q4_K_M.gguf', bytes: 1280835840 }],
};
export const LLM_CANDIDATES = { dicta: DICTA_MODEL, qwen35: QWEN35_MODEL, 'qwen35-2b': QWEN35_2B_MODEL };
export type LlmChoice = keyof typeof LLM_CANDIDATES;
export const MODELS: Record<ModelKind, ModelSpec> = {
  asr: {
    kind: 'asr', repo: 'ivrit-ai/zipformer2-66m-streaming-he', revision: 'ee769a2a13b887f91572eec349458bfb0fe79e7a', license: 'CC-BY-4.0 — Yakov Kolani; ONNX exports: ivrit.ai',
    files: [
      { path: 'onnx/config.json', bytes: 10365 }, { path: 'sherpa-onnx/tokens.txt', bytes: 17086 },
      { path: 'sherpa-onnx/encoder.int8.onnx', bytes: 70478964 }, { path: 'sherpa-onnx/decoder.int8.onnx', bytes: 1049105 }, { path: 'sherpa-onnx/joiner.int8.onnx', bytes: 771805 },
    ],
  },
  llm: QWEN35_2B_MODEL,
  tts: {
    kind: 'tts', repo: 'thewh1teagle/pocket-tts-onnx', revision: '110f5251188e9407b4f724acdd8b0dfd0b20692a', license: 'CC-BY-4.0 — Pocket Hebrew adapter / ONNX and ReNikud: thewh1teagle; base: Kyutai',
    files: [
      { path: 'he/model.onnx', bytes: 176992315 }, { path: 'he/assets.json', bytes: 1654421 },
      { path: 'he/manifest.json', bytes: 584 }, { path: 'he/renikud.onnx', bytes: 20620594 },
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

import { Wllama } from './runtime/llm/wllama.js';
let engine;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  const start = performance.now();
  try {
    if (data.type === 'load') {
      const cache = await caches.open(data.spec.cache);
      const response = await cache.match(data.spec.base + data.spec.files[0].path);
      if (!response) throw new Error('יש להוריד את מודל השפה תחילה.');
      engine = new Wllama({ default: new URL('./runtime/llm/wllama.wasm', self.location).href }, { suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error() {} } });
      engine.setCompat(null); // Never fall back to a remote compatibility runtime.
      const gpu = data.backend === 'auto' && navigator.gpu ? await navigator.gpu.requestAdapter().catch(() => null) : null;
      await engine.loadModel([await response.blob()], { n_ctx: 2048, n_batch: 128, n_ubatch: 64, n_threads: self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1, n_gpu_layers: gpu ? -1 : 0, jinja: true, reasoning: false, default_template_kwargs: { enable_thinking: false }, warmup: true, ctx_shift: false });
      const template = engine.getChatTemplate();
      // This exact Dicta conversion omits tokenizer.chat_template. Its upstream
      // chat_template.jinja at 5add44d6941d6ffb9eb6cc6b516f9fb4fd472494
      // is verified ChatML. Permit only that pinned artifact without metadata.
      const verifiedDicta = data.spec.repo === 'EMD123/DictaLM-3.0-1.7B-Instruct-Q4_K_M-GGUF' && data.spec.revision === '2f41ecf9bdeb2d75ff4dd85266970402c59c14d8';
      if ((!template || !template.includes('<|im_start|>')) && !verifiedDicta) throw new Error('תבנית השיחה במודל אינה נתמכת במתאם הזה.');
      self.postMessage({ type: 'ready', ms: performance.now() - start, engine: 'wllama-3.13.0', backend: gpu ? 'webgpu' : 'cpu', threads: self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1 });
    } else if (data.type === 'generate') {
      if (!data.grammar) throw new Error('חסרה סכמת הצעה מאומתת.');
      // Both evaluated model families use ChatML. Escape control tokens inside
      // untrusted message content; force non-thinking and bypass chat parsing.
      const prompt = data.messages.map(m => `<|im_start|>${m.role}\n${m.content.replace(/<\|/g, '＜|')}<|im_end|>\n`).join('') + '<|im_start|>assistant\n';
      const stream = await engine.createCompletion({ prompt, grammar: data.grammar, temperature: 0, max_tokens: 240, cache_prompt: true, stream: true });
      let text = '', firstTokenMs = null, finishReason = null;
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.text || '';
        if (delta && firstTokenMs === null) { firstTokenMs = performance.now() - start; self.postMessage({ type: 'progress', firstTokenMs }); }
        text += delta; finishReason = chunk.choices?.[0]?.finish_reason || finishReason;
      }
      self.postMessage({ type: 'result', text, ms: performance.now() - start, firstTokenMs, finishReason });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); }
  finally { busy = false; }
};

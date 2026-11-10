import { pipeline, env, TextStreamer } from './runtime/llm/transformers.js';
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useFSCache = false;
env.backends.onnx.wasm.wasmPaths = new URL('./runtime/llm/', self.location).href;
env.backends.onnx.wasm.numThreads = 1;
let generator;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    const start = performance.now();
    if (data.type === 'load') {
      const cache = await caches.open(data.spec.cache);
      // Fail closed: even optional missing model files never fall through to a network request.
      env.fetch = async input => {
        let url = typeof input === 'string' ? input : input.url || String(input);
        // v4 pipeline file discovery requests main even when revision is supplied.
        // Resolve that alias exclusively to the already-approved pinned cache.
        const main = `https://huggingface.co/${data.spec.repo}/resolve/main/`;
        if (url.startsWith(main)) url = data.spec.base + url.slice(main.length);
        if (!url.startsWith(data.spec.base)) throw new Error(`Model URL is outside the approved revision: ${url}`);
        return (await cache.match(url)) || new Response('', { status: 404 });
      };
      generator = await pipeline('text-generation', data.spec.repo, { revision: data.spec.revision, dtype: 'q4', device: 'wasm' });
      self.postMessage({ type: 'ready', ms: performance.now() - start });
    } else if (data.type === 'generate') {
      const prompt = generator.tokenizer.apply_chat_template(data.messages, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
      let firstTokenMs = null, outputTokens = 0;
      const streamer = new TextStreamer(generator.tokenizer, { skip_prompt: true, callback_function: () => {}, token_callback_function: tokens => {
        outputTokens += tokens.length;
        if (firstTokenMs === null) { firstTokenMs = performance.now() - start; self.postMessage({ type: 'progress', firstTokenMs }); }
      } });
      const result = await generator(prompt, { max_new_tokens: 192, do_sample: false, return_full_text: false, streamer });
      const generated = result[0].generated_text;
      const text = typeof generated === 'string' ? generated : generated.at(-1).content;
      self.postMessage({ type: 'result', text, ms: performance.now() - start, firstTokenMs, outputTokens });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); }
  finally { busy = false; }
};

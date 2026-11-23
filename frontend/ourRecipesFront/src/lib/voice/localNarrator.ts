import { normalizeHebrewSpeech } from './hebrewNarration';
import files from './noa-v1.json';

export const noaAssets = {cacheName:'recipe-noa-v1', base:'/voice/noa/v1/', files};
export const noaBytes = files.reduce((sum, file) => sum + file.bytes, 0);

export function supportsNoa() {
  return !!(window.isSecureContext && window.caches && crypto.subtle && navigator.serviceWorker &&
    window.Worker && window.WebAssembly && window.AudioContext);
}

// The phonemizer has a finite context. Split at word boundaries, keeping decimal
// points and fractional quantities intact. Do not silently truncate recipe steps.
export function speechChunks(text: string) {
  const chunks: string[] = [];
  let chunk = '';
  for (const word of text.trim().split(/\s+/)) {
    if (word.length > 180) throw Error('המילה ארוכה מדי להקראה. אפשר לקרוא אותה במסך.');
    if (chunk && chunk.length + word.length + 1 > 180) { chunks.push(chunk); chunk = ''; }
    chunk += (chunk ? ' ' : '') + word;
    if (/[.!?;:]$/.test(word)) { chunks.push(chunk); chunk = ''; }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

/** Owns a single local worker and player for one recipe guide. */
export class LocalNarrator {
  private worker: Worker | null = null;
  private audio: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private abort: AbortController | null = null;

  // Call synchronously from a gesture, including the start of a voice question.
  async unlock() {
    this.audio ??= new AudioContext();
    if (this.audio.state !== 'running') {
      const context = this.audio;
      await new Promise<void>((resolve,reject) => {
        const timer = setTimeout(() => reject(Error('יש ללחוץ על כפתור ההקראה כדי לאפשר שמע.')),4000);
        context.resume().then(() => {clearTimeout(timer); resolve();}, error => {clearTimeout(timer); reject(error);});
      });
    }
    return this.audio;
  }

  stop() {
    this.abort?.abort(); this.abort = null;
    if (this.source) { this.source.onended = null; this.source.stop(); this.source.disconnect(); this.source = null; }
    this.worker?.terminate(); this.worker = null;
  }
  close() {
    this.stop();
    if (this.audio) { void this.audio.close().catch(() => {}); this.audio = null; }
  }

  private synthesize(text: string, signal: AbortSignal) {
    const worker = this.worker ??= new Worker(noaAssets.base + 'worker.mjs', {type:'module'});
    return new Promise<{ pcm: Float32Array<ArrayBuffer>; rate: number }>((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        worker.onmessage = worker.onerror = null;
      };
      const fail = (message: string) => { clean(); reject(Error(message)); };
      const cancel = () => { clean(); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => fail('הקול לא הגיב. אפשר לנסות שוב.'), 90000);
      signal.addEventListener('abort', cancel, {once:true});
      worker.onerror = () => fail('טעינת הקול נכשלה.');
      worker.onmessage = ({data}) => {
        if (data.error) return fail(data.error);
        clean(); resolve(data);
      };
      try { worker.postMessage({text}); } catch { fail('לא ניתן להפעיל הקראה.'); }
    });
  }

  async play(text: string) {
    if (this.abort) this.stop();
    const controller = new AbortController();
    this.abort = controller;
    const {signal} = controller;
    try {
      const audio = await this.unlock();
      for (const chunk of speechChunks(normalizeHebrewSpeech(text))) {
        signal.throwIfAborted();
        const {pcm,rate} = await this.synthesize(chunk,signal);
        signal.throwIfAborted();
        const buffer = audio.createBuffer(1,pcm.length,rate);
        buffer.copyToChannel(pcm,0);
        const source = audio.createBufferSource();
        source.buffer = buffer; source.connect(audio.destination); this.source = source;
        await new Promise<void>((resolve,reject) => {
          const cancel = () => reject(new DOMException('Aborted','AbortError'));
          signal.addEventListener('abort',cancel,{once:true});
          source.onended = () => {
            signal.removeEventListener('abort',cancel);
            source.disconnect(); this.source = null; resolve();
          };
          source.start();
        });
      }
    } catch (error) {
      if (this.abort === controller) this.stop();
      throw error;
    } finally { if (this.abort === controller) this.abort = null; }
  }
}

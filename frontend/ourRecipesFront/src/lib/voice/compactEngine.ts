import files from './compact-v82.json';

const base = '/voice/compact/v82/';
const cacheName = 'recipe-compact-v82';
export const assetBytes = files.reduce((sum, file) => sum + file.bytes, 0);

export type Progress = 'pending' | 'partial' | 'done';
export type Action = { id: string; source: string; step: number };
export type ActiveRecipe = { id: string; version: string; name: string; actions: Action[] };
export type Turn = { role: 'user' | 'assistant'; content: string };
export type Write = { recipe_id: string; recipe_version: string; action: string; status: Progress };
export type Answer = { reply: string; writes: Write[] };

export function activeRecipe(id: number, name: string, steps: string[], ingredients: string[]): ActiveRecipe {
  const actions = steps.flatMap((line, step) => {
    const instruction = line.trim().replace(/^(?:\d+[.)\-:]|[-*•])\s*/, '');
    // Keep qualifications and explicit alternatives together with their source action.
    return instruction.split(/(?:;\s*|,\s*|\s+ו)(?=ל(?:ערבב|הוסיף|אפות|בשל|לוש|חמם|חתוך|טגן|רדד|מלא)(?![א-ת]))/)
      .map((source, i) => ({ id: 's' + step + 'a' + i, source: source.trim(), step }));
  });
  let hash = 2166136261;
  for (const char of JSON.stringify([steps, ingredients])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return { id: String(id), name, version: String(hash >>> 0), actions };
}

export function isProgress(value: unknown): value is Progress {
  return value === 'pending' || value === 'partial' || value === 'done';
}

export async function prepareCompact(signal: AbortSignal, onBytes: (n: number) => void) {
  if (!window.isSecureContext || !window.caches || !navigator.serviceWorker)
    throw new Error('העוזר דורש דפדפן עם אחסון מקומי וחיבור HTTPS.');
  if (!(await navigator.serviceWorker.getRegistration('/'))?.active) {
    await navigator.serviceWorker.register('/sw.js');
  }
  const cache = await caches.open(cacheName);
  let loaded = 0;
  for (const file of files) {
    signal.throwIfAborted();
    const url = base + file.path;
    if ((await cache.match(url))?.headers.get('X-Recipe-SHA256') !== file.sha256) {
      const response = await fetch(url, { signal, cache: 'reload' });
      if (!response.ok) throw new Error('הורדת העוזר נכשלה. אפשר לנסות שוב.');
      const buffer = await response.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
      const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
      if (buffer.byteLength !== file.bytes || hash !== file.sha256)
        throw new Error('קובץ המנוע לא עבר אימות. נסו שוב.');
      signal.throwIfAborted();
      await cache.put(url, new Response(buffer, { headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'X-Recipe-SHA256': hash,
      } }));
    }
    loaded += file.bytes;
    onBytes(loaded);
  }
}

export class CompactEngine {
  private worker = new Worker(base + 'worker.mjs', { type: 'module' });
  private sequence = 0;
  private pending?: (error: Error) => void;

  private ask(message: object, signal: AbortSignal): Promise<Answer | undefined> {
    signal.throwIfAborted();
    if (this.pending) throw new Error('העוזר עדיין מעבד בקשה.');
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.pending = undefined;
      };
      const fail = (e: Error) => { clean(); reject(e); };
      const abort = () => fail(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => fail(new Error('העוזר לא הגיב בזמן. נסו להפעיל אותו שוב.')), 90000);
      this.pending = fail;
      signal.addEventListener('abort', abort, { once: true });
      this.worker.onerror = () => fail(new Error('טעינת העוזר נכשלה בדפדפן הזה.'));
      this.worker.onmessage = ({ data }) => {
        if (data.id !== undefined && data.id !== String(this.sequence)) return;
        if (data.error) return fail(new Error('העוזר לא הצליח לעבד את הבקשה.'));
        clean();
        resolve(data.result);
      };
      this.worker.postMessage(message);
    });
  }

  async start(signal: AbortSignal) { await this.ask({}, signal); }

  async answer(recipe: ActiveRecipe, progress: Record<string, Progress>, currentStep: number,
               utterance: string, history: Turn[], signal: AbortSignal) {
    const result = await this.ask({ id: String(++this.sequence), input: { recipe, progress, currentStep, utterance, history } }, signal);
    if (!result || typeof result.reply !== 'string' || !Array.isArray(result.writes) ||
        result.writes.some(w => w.recipe_id !== recipe.id || w.recipe_version !== recipe.version ||
          !Object.hasOwn(progress, w.action) || !isProgress(w.status))) throw new Error('התקבל עדכון שלא תואם למתכון.');
    return result;
  }

  close() {
    this.pending?.(new DOMException('Aborted', 'AbortError'));
    this.worker.terminate();
  }
}

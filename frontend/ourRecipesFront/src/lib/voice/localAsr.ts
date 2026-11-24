import { modelStorage, prepareVoiceAssets } from './voiceAssets';
import files from './asr-v1.json';

export const asrBase = '/voice/asr/v1/';
export const asrCache = 'recipe-asr-v1';
export const asrBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const source = 'https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he/resolve/ee769a2a13b887f91572eec349458bfb0fe79e7a/sherpa-onnx/';

export function supportsAsr() {
  return !!(window.isSecureContext && window.caches && crypto.subtle && navigator.serviceWorker &&
    window.Worker && window.WebAssembly && typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    window.MediaRecorder && window.OfflineAudioContext);
}

const assets = {cacheName:asrCache, base:asrBase, files:files.map(f =>
  'remote' in f ? {...f, source:source + f.path} : f)};
export const asrStorage = () => modelStorage(assets);
export const prepareAsr = (signal: AbortSignal, progress: (bytes: number) => void) =>
  prepareVoiceAssets(assets, signal, progress);

const kitchenVerbs = ['הרטבתי','ניגבתי','ניערתי','ייבשתי','קיררתי','חיממתי','קילפתי','שטפתי','סיננתי',
  'פיררתי','קיצצתי','שימנתי','תיבלתי','פרסתי','סידרתי','כיסיתי','ריסקתי','גירדתי','פיזרתי','מזגתי','טבלתי','הקצפתי','הפשרתי'];
const actions = [
  ['בישלתי','לבשל','מבשלים','מבשלות','בשלו'], ['טיגנתי','לטגן','מטגנים','מטגנות','טגנו'],
  ['ערבבתי','לערבב','מערבבים','מערבבות','ערבבו'], ['הוספתי','להוסיף','מוסיפים','מוסיפות','הוסיפו'],
];

export function recipeHints(ingredients: string[], steps: string[]) {
  const nouns = new Set(ingredients.map(name => name.match(/[א-ת]+/)?.[0]).filter((s): s is string => !!s && s.length > 1));
  const tokens = new Set((steps.join(' ').match(/[א-ת]+/g) || []).map(s => s.replace(/^ו/, '')));
  const verbs = actions.filter(([, ...forms]) => forms.some(s => tokens.has(s))).map(([verb]) => verb);
  const heads = Array.from(nouns).slice(0,64).flatMap(n => ['', 'ה','ב','ל','מ','ו','וה'].map(prefix => prefix + n));
  const hints = (words: string[]) => [...heads, ...words.flatMap(v => [v,'ו'+v,'לא '+v,'עוד לא '+v])];
  return { verbs, otherVerbs: kitchenVerbs, lists: { ingredients: heads, actions: hints(verbs), alternatives: hints([...verbs,...kitchenVerbs]) } };
}

export type Transcript = { text: string; uncertain: boolean };

export class RecipeTranscriber {
  private worker = new Worker(asrBase + 'worker.mjs', { type: 'module' });
  private rejectPending?: () => void;

  private request<T>(message: object, transfer: Transferable[] = []) {
    return new Promise<T>((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        this.worker.onmessage = this.worker.onerror = null;
        this.rejectPending = undefined;
      };
      const fail = () => { finish(); reject(Error('פענוח השמע נכשל. אפשר לנסות שוב או להקליד.')); };
      const timer = setTimeout(fail, 90000);
      this.rejectPending = fail;
      this.worker.onerror = fail;
      this.worker.onmessage = ({data}) => {
        if (data.error) return fail();
        finish(); resolve(data);
      };
      try { this.worker.postMessage(message, transfer); } catch { fail(); }
    });
  }

  load(ingredients: string[], steps: string[]) {
    return this.request({ type:'load', cacheName:asrCache, hints:recipeHints(ingredients,steps),
      files:files.filter(f => 'remote' in f || f.path === 'bpe.vocab').map(f => f.path) });
  }
  transcribe(pcm: Float32Array<ArrayBuffer>) {
    return this.request<Transcript>({ type:'transcribe', pcm }, [pcm.buffer]);
  }
  close() { this.rejectPending?.(); this.worker.terminate(); }
}

export async function recordingSamples(blob: Blob) {
  const audio = new OfflineAudioContext(1,1,16000);
  const decoded = await audio.decodeAudioData(await blob.arrayBuffer());
  if (!decoded.length || decoded.duration > 32) throw Error('יש להקליט משפט קצר ולנסות שוב.');
  const pcm = new Float32Array(decoded.length);
  for (let channel=0; channel<decoded.numberOfChannels; channel++) {
    const samples = decoded.getChannelData(channel);
    for (let i=0;i<pcm.length;i++) pcm[i] += samples[i] / decoded.numberOfChannels;
  }
  return pcm;
}

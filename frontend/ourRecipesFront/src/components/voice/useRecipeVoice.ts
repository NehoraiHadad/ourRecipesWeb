'use client';
import { useEffect, useRef, useState } from 'react';
import { deleteModels, downloadModel, hasModel, MODELS, LLM_CANDIDATES, type LlmChoice, modelCacheName, modelURL, type ModelKind } from '@/lib/voice/models';
import { StreamingSpeaker } from '@/lib/voice/streamingSpeaker';
import { LocalMicrophone } from '@/lib/voice/microphone';

export interface VoiceMeasurement { stage: string; ms: number; audioSeconds?: number; rtf?: number }
type Status = 'missing' | 'cached' | 'loading' | 'ready';
type WorkerMessage = { type: 'ready' | 'result' | 'error' | 'progress' | 'audio'; firstTokenMs?: number; ms: number; text: string; message: string; audioSeconds?: number; pcm?: Float32Array; sampleRate?: number; firstAudioMs?: number };
export function useRecipeVoice() {
  const [llmChoice, setLlmChoice] = useState<LlmChoice>('qwen35-2b');
  const models = { ...MODELS, llm: LLM_CANDIDATES[llmChoice] };
  const [supported, setSupported] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  const [status, setStatus] = useState<Record<ModelKind, Status>>({ asr: 'missing', llm: 'missing', tts: 'missing' });
  const [download, setDownload] = useState<{ kind: ModelKind; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechMode, setSpeechMode] = useState<'system' | 'pocket'>('system');
  const speaker = useRef<StreamingSpeaker | null>(null);
  const [error, setError] = useState('');
  const [measurements, setMeasurements] = useState<VoiceMeasurement[]>([]);
  const workers = useRef<Partial<Record<ModelKind, Worker>>>({});
  const pending = useRef<Partial<Record<ModelKind, { resolve: (m: WorkerMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>>>({});
  const downloading = useRef<{ controller: AbortController; task: Promise<void> } | null>(null);
  const mic = useRef<LocalMicrophone | null>(null);
  const alive = useRef(true);
  const speechLock = useRef(false);
  const operation = useRef(false);
  const removing = useRef(false);
  const epoch = useRef(0);
  const speechEpoch = useRef(0);
  const coolingUntil = useRef(0);
  const speechTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function stopSpeech() {
    speechEpoch.current++; clearTimeout(speechTimeout.current);
    if (speaker.current || pending.current.tts) {
      speaker.current?.stop(); speaker.current = null; release('tts');
      setStatus(s => ({ ...s, tts: s.tts === 'missing' ? 'missing' : 'cached' }));
      operation.current = false; setBusy(false);
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (speechLock.current) coolingUntil.current = performance.now() + 700;
    speechLock.current = false; setSpeaking(false);
  }
  function release(kind: ModelKind, reason = 'הפעולה בוטלה.') {
    workers.current[kind]?.terminate(); delete workers.current[kind];
    const p = pending.current[kind];
    if (p) { clearTimeout(p.timer); p.reject(new Error(reason)); delete pending.current[kind]; }
  }
  function cancel() {
    epoch.current++; stopSpeech(); mic.current?.cancel(); mic.current = null;
    for (const kind of ['asr', 'llm', 'tts'] as const) {
      release(kind);
      setStatus(s => ({ ...s, [kind]: s[kind] === 'ready' || s[kind] === 'loading' ? 'cached' : s[kind] }));
    }
    downloading.current?.controller.abort();
    operation.current = false; setBusy(false); setRecording(false);
  }
  useEffect(() => {
    alive.current = true;
    setSupported(window.isSecureContext && typeof Worker === 'function' && typeof WebAssembly === 'object' && typeof window.caches?.open === 'function');
    setCanRecord(!!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode === 'function');
    const refresh = () => setVoices(window.speechSynthesis ? window.speechSynthesis.getVoices().filter(v => v.localService === true && /^(he|iw)(-|$)/i.test(v.lang)) : []);
    refresh(); window.speechSynthesis?.addEventListener('voiceschanged', refresh);
    const mountedEpoch = epoch.current;
    if (typeof window.caches?.open === 'function') for (const kind of ['asr', 'llm', 'tts'] as const) void hasModel(models[kind]).then(cached => { if (alive.current && cached && epoch.current === mountedEpoch) setStatus(s => ({ ...s, [kind]: 'cached' })); }).catch(() => {});
    return () => {
      alive.current = false; epoch.current++; speechEpoch.current++; clearTimeout(speechTimeout.current);
      speaker.current?.stop(); mic.current?.cancel(); window.speechSynthesis?.cancel(); downloading.current?.controller.abort();
      release('asr'); release('llm'); release('tts'); window.speechSynthesis?.removeEventListener('voiceschanged', refresh);
    };
  }, []);

  function request(kind: ModelKind, payload: object): Promise<WorkerMessage> {
    if (pending.current[kind]) return Promise.reject(new Error('המודל עסוק.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { release(kind, 'המודל לא השיב בתוך שתי דקות. אפשר להמשיך בכפתורים.'); setStatus(s => ({ ...s, [kind]: 'cached' })); }, 120000);
      pending.current[kind] = { resolve, reject, timer };
      workers.current[kind]!.postMessage(payload);
    });
  }
  async function load(kind: ModelKind) {
    if (workers.current[kind] && status[kind] === 'ready') return;
    const worker = new Worker(`/voice/${kind}-worker.js`, { type: 'module' }); workers.current[kind] = worker;
    worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (workers.current[kind] !== worker || !alive.current) return;
      if (data.type === 'audio') { if (kind === 'tts' && pending.current.tts && speechLock.current && data.pcm && data.sampleRate) speaker.current?.push(data.pcm, data.sampleRate); return; }
      if (data.type === 'progress') { if (data.firstTokenMs !== undefined) setMeasurements(m => [...m, { stage: 'llm:first-token', ms: data.firstTokenMs! }]); return; }
      const p = pending.current[kind]; if (!p) return;
      clearTimeout(p.timer); delete pending.current[kind];
      if (data.type === 'error') p.reject(new Error(data.message)); else p.resolve(data);
    };
    worker.onerror = event => {
      if (workers.current[kind] !== worker || !alive.current) return;
      const p = pending.current[kind]; if (p) { clearTimeout(p.timer); delete pending.current[kind]; p.reject(new Error(event.message || 'לא ניתן לטעון את מנוע הקול בדפדפן הזה.')); }
    };
    setStatus(s => ({ ...s, [kind]: 'loading' }));
    const spec = models[kind];
    try {
      const result = await request(kind, { type: 'load', backend: 'auto', spec: { ...spec, cache: modelCacheName(spec), base: modelURL(spec, '') } });
      if (!alive.current || workers.current[kind] !== worker) throw new Error('הפעולה בוטלה.');
      setMeasurements(m => [...m, { stage: `${kind}:load`, ms: result.ms }]);
      setStatus(s => ({ ...s, [kind]: 'ready' }));
    } catch (e) { if (workers.current[kind] === worker) { release(kind); if (alive.current) setStatus(s => ({ ...s, [kind]: 'cached' })); } throw e; }
  }
  async function guarded<T>(fn: (token: number) => Promise<T>): Promise<T | undefined> {
    if (operation.current || removing.current || downloading.current || speechLock.current) return;
    operation.current = true; const token = epoch.current; setBusy(true); setError('');
    try { return await fn(token); }
    catch (e) { if (alive.current && token === epoch.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current && token === epoch.current) { operation.current = false; setBusy(false); } }
  }
  async function prepare(kind: ModelKind) {
    if (operation.current || removing.current || downloading.current) return;
    const controller = new AbortController(); const started = performance.now();
    setError(''); setDownload({ kind, bytes: 0 });
    const task = downloadModel(models[kind], controller.signal, bytes => { if (alive.current) setDownload({ kind, bytes }); });
    downloading.current = { controller, task };
    try {
      await task;
      if (alive.current) { setStatus(s => ({ ...s, [kind]: 'cached' })); if (kind === 'tts') setSpeechMode('pocket'); setMeasurements(m => [...m, { stage: `${kind}:download`, ms: performance.now() - started }]); }
    } catch (e) { if (!controller.signal.aborted && alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { downloading.current = null; if (alive.current) setDownload(null); }
  }
  async function remove() {
    if (removing.current) return;
    removing.current = true;
    const task = downloading.current?.task;
    cancel(); operation.current = true; setBusy(true);
    const token = epoch.current;
    try {
      if (task) await task.catch(() => {});
      await deleteModels();
      if (alive.current && token === epoch.current) { setStatus({ asr: 'missing', llm: 'missing', tts: 'missing' }); setError(''); }
    } catch { if (alive.current && token === epoch.current) setError('לא ניתן למחוק את המטמון בדפדפן הזה.'); }
    finally { removing.current = false; if (alive.current && token === epoch.current) { operation.current = false; setBusy(false); } }
  }
  function changeLlm(choice: LlmChoice) {
    if (operation.current || removing.current || downloading.current) return;
    cancel(); const token = epoch.current; setLlmChoice(choice); setStatus(s => ({ ...s, llm: 'missing' }));
    if (typeof window.caches?.open === 'function') void hasModel(LLM_CANDIDATES[choice]).then(cached => {
      if (alive.current && token === epoch.current) setStatus(s => ({ ...s, llm: cached ? 'cached' : 'missing' }));
    }).catch(() => {});
  }
  async function generate(messages: { role: string; content: string }[], schema?: object, grammar?: string) {
    return guarded(async token => {
      await load('llm'); if (token !== epoch.current) return;
      const result = await request('llm', { type: 'generate', messages, schema, grammar });
      if (token !== epoch.current) return;
      setMeasurements(m => [...m, { stage: 'llm:generate', ms: result.ms }]); return result.text;
    });
  }
  async function speakPocket(text: string) {
    if (operation.current || removing.current || downloading.current || mic.current || status.tts === 'missing') return;
    stopSpeech(); const id = speechEpoch.current; const token = epoch.current;
    operation.current = true; speechLock.current = true; setBusy(true); setSpeaking(true); setError('');
    const player = new StreamingSpeaker(); speaker.current = player;
    try {
      await player.open();
      if (id !== speechEpoch.current || token !== epoch.current) return;
      await load('tts');
      if (id !== speechEpoch.current || token !== epoch.current) return;
      const result = await request('tts', { type: 'speak', text });
      if (id !== speechEpoch.current || token !== epoch.current) return;
      setMeasurements(m => [...m, { stage: 'tts:generate', ms: result.ms, audioSeconds: result.audioSeconds }, { stage: 'tts:first-pcm', ms: result.firstAudioMs || 0 }]);
      await player.finished();
    } catch (e) { if (alive.current && id === speechEpoch.current && token === epoch.current) setError(e instanceof Error ? e.message : String(e)); }
    finally {
      player.stop();
      if (alive.current && id === speechEpoch.current && token === epoch.current) {
        speaker.current = null; speechLock.current = false; coolingUntil.current = performance.now() + 700;
        operation.current = false; setBusy(false); setSpeaking(false);
      }
    }
  }
  function speak(text: string) {
    if (speechMode === 'pocket') { void speakPocket(text); return; }
    if (operation.current || mic.current || !voices.length) return;
    stopSpeech(); speechLock.current = true; setSpeaking(true);
    const id = speechEpoch.current;
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'he-IL'; utterance.voice = voices[0];
    const start = performance.now();
    utterance.onstart = () => { if (id === speechEpoch.current) setMeasurements(m => [...m, { stage: 'tts:first-audio', ms: performance.now() - start }]); };
    const finish = () => { if (id === speechEpoch.current) { clearTimeout(speechTimeout.current); speechLock.current = false; coolingUntil.current = performance.now() + 700; setSpeaking(false); } };
    utterance.onend = finish;
    utterance.onerror = () => { if (id !== speechEpoch.current || !alive.current) return; finish(); setError('ההקראה המקומית נכשלה. אפשר להמשיך בטקסט.'); };
    speechTimeout.current = setTimeout(() => { if (id === speechEpoch.current) stopSpeech(); }, 90000);
    window.speechSynthesis.speak(utterance);
  }
  async function stopRecording(onText: (text: string) => void) {
    const recorder = mic.current; if (!recorder) return;
    mic.current = null; setRecording(false); const token = epoch.current;
    try {
      const pcm = await recorder.finish();
      if (token !== epoch.current) return;
      const result = await request('asr', { type: 'transcribe', pcm });
      if (token !== epoch.current) return;
      setMeasurements(m => [...m, { stage: 'asr:transcribe', ms: result.ms, audioSeconds: result.audioSeconds, rtf: result.audioSeconds ? result.ms / 1000 / result.audioSeconds : undefined }]);
      onText(result.text);
    } catch (e) { if (token === epoch.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (token === epoch.current) { operation.current = false; setBusy(false); } }
  }
  async function startRecording(onText: (text: string) => void) {
    if (operation.current || removing.current || downloading.current || speechLock.current || performance.now() < coolingUntil.current) return;
    operation.current = true; const token = epoch.current; setBusy(true); setError('');
    try {
      await load('asr'); if (token !== epoch.current) return;
      const recorder = new LocalMicrophone(); mic.current = recorder;
      await recorder.start(() => { void stopRecording(onText); });
      if (token === epoch.current) setRecording(true);
    } catch (e) { if (token === epoch.current) { mic.current?.cancel(); mic.current = null; operation.current = false; setBusy(false); setError(e instanceof Error ? e.message : String(e)); } }
  }
  return { models, llmChoice, changeLlm, supported, canRecord, speechMode, setSpeechMode, status, download, busy, recording, speaking, voices, error, measurements, prepare, remove, cancel, generate, speak, stopSpeech, startRecording, stopRecording };
}

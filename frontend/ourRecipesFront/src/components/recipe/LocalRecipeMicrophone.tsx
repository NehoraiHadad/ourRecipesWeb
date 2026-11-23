'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { asrBytes, asrCache, asrStorage, prepareAsr, RecipeTranscriber, recordingSamples, supportsAsr } from '@/lib/voice/localAsr';

type Props = {
  steps: string[]; ingredients: string[]; disabled: boolean;
  interrupt: MutableRefObject<(() => void) | null>;
  stopVoice: () => void; onTranscript: (text: string) => void;
};
type Stage = 'idle' | 'download' | 'permission' | 'recording' | 'decoding' | 'deleting';

export default function LocalRecipeMicrophone({ steps, ingredients, disabled, interrupt, stopVoice, onTranscript }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [stored, setStored] = useState<Awaited<ReturnType<typeof asrStorage>>>('empty');
  const [stage, setStage] = useState<Stage>('idle');
  const [bytes, setBytes] = useState(0);
  const [message, setMessage] = useState('');
  const [review, setReview] = useState<string | null>(null);
  const run = useRef(0);
  const download = useRef<AbortController | null>(null);
  const engine = useRef<RecipeTranscriber | null>(null);
  const capture = useRef<MediaRecorder | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliver = useRef(onTranscript);
  deliver.current = onTranscript;

  const stopCapture = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    const rec = capture.current;
    capture.current = null;
    if (rec?.state === 'recording') rec.stop();
    rec?.stream.getTracks().forEach(t => t.stop());
  }, []);
  const cancelAudio = useCallback(() => {
    if (download.current) return;
    run.current++;
    stopCapture();
    engine.current?.close(); engine.current = null;
    setStage('idle'); setReview(null); setMessage('');
  }, [stopCapture]);

  useEffect(() => {
    let live = true;
    const available = supportsAsr();
    setSupported(available);
    if (available) void asrStorage().then(s => { if (live) setStored(s); })
      .catch(() => { if (live) setSupported(false); });
    interrupt.current = cancelAudio;
    return () => {
      live = false; run.current++;
      download.current?.abort(); download.current = null;
      stopCapture(); engine.current?.close(); engine.current = null;
      interrupt.current = null;
    };
  }, [cancelAudio, interrupt, stopCapture]);

  async function install() {
    const id = ++run.current;
    const controller = new AbortController();
    download.current = controller;
    setStage('download'); setBytes(0); setMessage('');
    try {
      await prepareAsr(controller.signal, n => { if (id === run.current) setBytes(n); });
      if (id === run.current) setStored('complete');
    } catch (error) {
      if (id === run.current) {
        setMessage(controller.signal.aborted ? 'ההורדה בוטלה.' : error instanceof Error ? error.message : 'ההורדה נכשלה.');
        const s = await asrStorage().catch(() => 'partial' as const);
        if (id === run.current) setStored(s);
      }
    } finally {
      if (id === run.current) { download.current = null; setStage('idle'); }
    }
  }
  async function erase() {
    cancelAudio();
    const id = run.current;
    setStage('deleting');
    try {
      await caches.delete(asrCache);
      if (id === run.current) { setStored('empty'); setMessage('קובצי התמלול נמחקו מהמכשיר.'); }
    } catch { if (id === run.current) setMessage('מחיקת הקבצים נכשלה.'); }
    finally { if (id === run.current) setStage('idle'); }
  }

  async function start() {
    stopVoice();
    const id = ++run.current;
    setReview(null); setMessage(''); setStage('permission');
    let stream: MediaStream | undefined;
    const fail = (msg: string) => {
      if (run.current !== id) return;
      cancelAudio(); setMessage(msg);
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true } });
      if (run.current !== id) { stream.getTracks().forEach(t => t.stop()); return; }
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      capture.current = rec;
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onerror = () => fail('ההקלטה נכשלה. אפשר לנסות שוב או להקליד.');
      rec.onstop = async () => {
        if (run.current !== id) return;
        stopCapture(); setStage('decoding');
        try {
          const pcm = await recordingSamples(new Blob(chunks,{type:rec.mimeType}));
          if (run.current !== id) return;
          if (!engine.current) {
            engine.current = new RecipeTranscriber();
            await engine.current.load(ingredients,steps);
          }
          if (run.current !== id || !engine.current) return;
          const result = await engine.current.transcribe(pcm);
          if (run.current !== id) return;
          setStage('idle');
          const text = result.text.trim();
          if (!text) setMessage('לא זוהה דיבור. אפשר להקליט שוב.');
          else if (result.uncertain) setReview(text);
          else deliver.current(text);
        } catch (error) { fail(error instanceof Error ? error.message : 'התמלול נכשל. אפשר להקליד.'); }
      };
      rec.start(); setStage('recording');
      timeout.current = setTimeout(stopCapture, 15000);
    } catch {
      stream?.getTracks().forEach(t => t.stop());
      fail('המיקרופון אינו זמין. בדקו הרשאה או השתמשו בכפתורים ובהקלדה.');
    }
  }
  if (supported === null) return null;
  if (!supported) return <p className="text-xs">התמלול המקומי אינו זמין בדפדפן הזה. אפשר להשתמש בכפתורים או להקליד לעוזר.</p>;
  const busy = stage !== 'idle';
  return <div className="space-y-2 border-t pt-2">
    {stored === 'complete' ? <Button size="sm" variant="secondary" disabled={stage !== 'recording' && (disabled || busy)}
      onClick={stage === 'recording' ? stopCapture : start}>{stage === 'recording' ? 'סיום ושליחה לתמלול' : 'הקלטת שאלה או עדכון'}</Button> :
      <Button size="sm" variant="secondary" onClick={install} disabled={busy}>הורדת תמלול עברי למכשיר · 86 מ״ב</Button>}
    {stage === 'download' && <><progress aria-label="הורדת מודל התמלול" max={asrBytes} value={bytes} />
      <Button size="sm" variant="ghost" onClick={() => download.current?.abort()}>ביטול ההורדה</Button></>}
    {['recording','permission','decoding'].includes(stage) && <Button size="sm" variant="ghost" onClick={cancelAudio}>ביטול ההקלטה</Button>}
    {stored !== 'empty' && !busy && <Button size="sm" variant="ghost" onClick={erase}>מחיקת התמלול מהמכשיר</Button>}
    <p className="text-xs text-secondary-600">השמע מפוענח במכשיר. אפשר להקליט עד 15 שניות.</p>
    <p role="status">{stage === 'decoding' ? 'מתמלל במכשיר…' : stage === 'recording' ? 'מקליט…' : stage === 'permission' ? 'ממתין להרשאת מיקרופון…' : message}</p>
    {review !== null && <div><label>מילה בתמלול אינה ברורה. מה נאמר?
      <textarea className="block w-full rounded border p-2" maxLength={600} value={review} onChange={e => setReview(e.target.value)} /></label>
      <Button size="sm" disabled={disabled || !review.trim()} onClick={() => {setReview(null); deliver.current(review.trim());}}>אישור התמלול</Button>
      <Button size="sm" variant="ghost" onClick={() => setReview(null)}>ביטול</Button></div>}
  </div>;
}

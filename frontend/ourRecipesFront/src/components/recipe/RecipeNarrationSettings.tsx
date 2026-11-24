'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { modelStorage, prepareVoiceAssets } from '@/lib/voice/voiceAssets';
import { noaAssets, noaBytes, supportsNoa } from '@/lib/voice/localNarrator';

type Props = {
  system: boolean; installed: boolean; usingNoa: boolean;
  setInstalled: (value: boolean) => void; choose: (noa: boolean) => void;
};

export default function RecipeNarrationSettings({system, installed, usingNoa, setInstalled, choose}: Props) {
  const [supported,setSupported] = useState<boolean | null>(null);
  const [partial,setPartial] = useState(false);
  const [busy,setBusy] = useState<'download' | 'delete' | null>(null);
  const [progress,setProgress] = useState(0);
  const [message,setMessage] = useState('');
  const lifetime = useRef(0);
  const download = useRef<AbortController | null>(null);
  useEffect(() => {
    const id = ++lifetime.current;
    const available = supportsNoa();
    setSupported(available);
    if (available) void modelStorage(noaAssets).then(s => {
      if (id === lifetime.current) {setInstalled(s === 'complete'); setPartial(s === 'partial');}
    }).catch(() => { if (id === lifetime.current) setSupported(false); });
    return () => {lifetime.current++; download.current?.abort();};
  }, [setInstalled]);

  async function install() {
    const id = ++lifetime.current;
    download.current = new AbortController();
    const {signal} = download.current;
    setMessage(''); setProgress(0); setBusy('download');
    try {
      await prepareVoiceAssets(noaAssets,signal,n => {if (id === lifetime.current) setProgress(n);});
      if (id === lifetime.current) {setInstalled(true); choose(true); setPartial(false);}
    } catch (error) {
      const state = await modelStorage(noaAssets).catch(() => 'partial');
      if (id === lifetime.current) {
        setInstalled(state === 'complete'); setPartial(state === 'partial');
        setMessage(signal.aborted ? 'הורדת הקול בוטלה.' : error instanceof Error ? error.message : 'הורדת הקול נכשלה.');
      }
    } finally { if (id === lifetime.current) {download.current = null; setBusy(null);} }
  }
  async function erase() {
    const id = ++lifetime.current;
    choose(false); setBusy('delete'); setMessage('');
    try {
      await caches.delete(noaAssets.cacheName);
      if (id === lifetime.current) {setInstalled(false); setPartial(false); setMessage('הקול נועה נמחק מהמכשיר.');}
    } catch {if (id === lifetime.current) setMessage('מחיקת הקול נכשלה.');}
    finally {if (id === lifetime.current) setBusy(null);}
  }
  if (!supported) return supported === false && !system ? <p>הקראה בעברית אינה זמינה. אפשר לקרוא את השלבים במסך.</p> : null;
  return <details className="space-y-2" open={!system && !installed || !!busy || undefined}>
    <summary className="cursor-pointer text-sm">קול להקראה בעברית</summary>
    {installed && system && <label>קול להקראה <select value={usingNoa ? 'noa' : 'system'} onChange={e => choose(e.target.value === 'noa')}>
      <option value="system">קול המכשיר</option><option value="noa">נועה</option>
    </select></label>}
    {installed ? <Button size="sm" variant="ghost" onClick={erase} disabled={!!busy}>מחיקת הקול נועה</Button> :
      <Button size="sm" variant="secondary" onClick={install} disabled={!!busy}>הורדת הקול נועה · {Math.round(noaBytes/1e6)} מ״ב</Button>}
    {busy === 'download' && <><progress max={noaBytes} value={progress} aria-label="הורדת הקול נועה" />
      <Button size="sm" variant="ghost" onClick={() => download.current?.abort()}>ביטול הורדת הקול</Button></>}
    {partial && !busy && <Button size="sm" variant="ghost" onClick={erase}>מחיקת ההורדה החלקית</Button>}
    <p className="text-xs text-secondary-600">{system ? 'קול מערכת עברי זמין במכשיר.' : 'נועה מקריאה את השלבים והתשובות במכשיר אחרי ההורדה.'}</p>
    {message && <p role="status">{message}</p>}
  </details>;
}

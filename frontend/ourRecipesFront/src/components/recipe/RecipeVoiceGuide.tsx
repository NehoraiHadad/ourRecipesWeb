'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useCompactCooking, progressLabel } from '@/hooks/useCompactCooking';
import { assetBytes, type ActiveRecipe, type Progress } from '@/lib/voice/compactEngine';
import { narratedSteps } from '@/lib/voice/stepGuidance';
import { recipeVoiceCommand } from '@/lib/recipes/voiceCommands';
import { Button } from '@/components/ui/Button';
import { useRecipeVoice } from '@/hooks/useRecipeVoice';

import RecipeNarrationSettings from './RecipeNarrationSettings';
import { LiveMicrophone } from '@/lib/voice/liveMicrophone';
import { prepareAsr, asrBytes, type Transcript } from '@/lib/voice/localAsr';
import { noaAssets, noaBytes, supportsNoa } from '@/lib/voice/localNarrator';
import { prepareVoiceAssets } from '@/lib/voice/voiceAssets';
import LocalRecipeMicrophone from './LocalRecipeMicrophone';

export default function RecipeVoiceGuide({ steps, recipe, ingredients }: { steps: string[]; recipe: ActiveRecipe; ingredients: string[] }) {
  const cooking = useCompactCooking(recipe);
  const [text, setText] = useState('');
  const interrupt = useRef<(() => void) | null>(null);
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<'off' | 'setup' | 'listening'>('off');
  const [partial, setPartial] = useState('');
  const [notice, setNotice] = useState('');
  const [download, setDownload] = useState({label:'', bytes:0, total:0});
  const session = useRef<AbortController | null>(null);
  const microphone = useRef<LiveMicrophone | null>(null);
  const conversation = useRef<{ stop(): void; mute(value: boolean): void } | null>(null);
  type SpokenTurn = { text: string; step: number; speak: (message: string) => void };
  const [queue, setQueue] = useState<SpokenTurn[]>([]);
  const guidance = useMemo(() => narratedSteps(recipe, steps, cooking.progress), [recipe, steps, cooking.progress]);
  const voice = useRecipeVoice(guidance, (heard, step, speak): boolean => {
    const command = heard.trim().replace(/[.!?״]+$/g, '');
    // Pure navigation remains available even before downloading the model.
    if (recipeVoiceCommand(heard) === 'stop') { setQueue([]); return false; }
    if (
        /^(?:(?:תתחיל[י]? |התחל[י]? )?מההתחלה|התחל[י]? מחדש|(?:חזור|חזרי|תחזור|תחזרי)(?: על השלב)?|(?:השלב |שלב )?(?:הקודם|הבא)|אפשר להמשיך|תמשיך|תמשיכי)$/.test(command)) return false;
    if (cooking.stage === 'idle') {
      if (/^(?:מה עכשיו|מה הלאה|מה השלב הבא|אחורה|שוב|עוד פעם)$/.test(command)) return false;
      setText(heard);
      return true;
    }
    if (!session.current && !voice.microphoneOn) {
      setText(heard);
      handleTurn({ text: heard, step, speak });
      return true;
    }
    setQueue(turns => [...turns, { text: heard, step, speak }]);
    return true;
  }, interrupt, conversation);
  useEffect(() => {
    if ((!voice.microphoneOn && !session.current) || cooking.stage === 'idle') {
      if (queue.length) setQueue([]);
      return;
    }
    if (voice.speaking || cooking.stage !== 'ready' || !queue.length) return;
    const [turn, ...rest] = queue;
    setQueue(rest);
    setText(turn.text);
    handleTurn({...turn, step:voice.stepIndex});
  }, [queue, voice, cooking]);

  function handleTurn(turn: SpokenTurn) {
    const response = turn.text.trim().replace(/[.!?]+$/g, '');
    if (cooking.proposal && /^(?:כן|אישור|לאשר|נכון|מאשר|מאשרת|כן תאשר)$/.test(response)) {
      const reply = cooking.confirm(turn.step, voice.focus);
      if (reply) turn.speak(reply);
    } else if (cooking.proposal && /^(?:לא|ביטול|בטל|לבטל|לא נכון)$/.test(response)) {
      cooking.dismiss(); turn.speak('העדכון בוטל.');
    } else {
      void cooking.submit(turn.text, turn.step, turn.speak, voice.focus);
    }
  }

  const events = useRef({ final: (_turn: Transcript) => {}, failed: (_message: string) => {}, read: () => {} });
  events.current = {
    read: voice.read,
    final(turn) {
      if (!session.current) return;
      if (turn.uncertain) {
        const prompt = 'לא שמעתי בבירור. אפשר לחזור על המשפט?';
        setNotice(prompt);
        voice.speak(prompt);
      } else if (turn.text.trim()) {
        setNotice('');
        voice.acceptTranscript(turn.text.trim());
      }
    },
    failed(message) { voice.stop(); setNotice(message); }
  };

  conversation.current = {
    mute(value) { microphone.current?.mute(value); },
    stop() {
      if (!session.current) return;
      session.current.abort();
      session.current = null;
      microphone.current?.close();
      microphone.current = null;
      setQueue([]); setPartial(''); setPhase('off'); setNotice('');
    }
  };
  useEffect(() => {
    setAvailable(!!(window.isSecureContext && window.caches && window.crypto?.subtle && navigator.serviceWorker &&
      window.Worker && window.WebAssembly && typeof navigator.mediaDevices?.getUserMedia === 'function' && window.AudioWorkletNode && window.AudioContext));
  }, []);

  useEffect(() => {
    if (phase === 'listening' && cooking.stage === 'idle') {
      events.current.failed(cooking.error || 'עוזר המתכון נעצר. אפשר להפעיל שוב את הליווי.');
    }
  }, [phase, cooking.stage, cooking.error]);

  async function startConversation() {
    if (session.current) return;
    voice.stop();
    const controller = new AbortController();
    session.current = controller;
    const {signal} = controller;
    setNotice(''); setPhase('setup');
    const needNoa = !voice.systemVoice && supportsNoa();
    try {
      if (needNoa || voice.usingNoa) voice.primeNoa(true);
      const mic = new LiveMicrophone(setPartial, turn => events.current.final(turn), message => events.current.failed(message));
      microphone.current = mic;
      await mic.unlock();
      signal.throwIfAborted();
      const progress = (label: string, total: number) => (bytes: number) => {
        if (!signal.aborted) setDownload({label, total, bytes});
      };
      const asrProgress = progress('הכנת התמלול', asrBytes);
      asrProgress(0);
      await prepareAsr(signal, asrProgress);
      signal.throwIfAborted();
      if (needNoa) {
        const noaProgress = progress('הכנת הקול נועה', noaBytes);
        noaProgress(0);
        await prepareVoiceAssets(noaAssets, signal, noaProgress);
        signal.throwIfAborted();
        voice.setInstalled(true);
      }
      setDownload({label:'הכנת עוזר המתכון', bytes:0, total:assetBytes});
      if (!await cooking.start(signal)) throw Error('טעינת העוזר לא הושלמה. אפשר לנסות שוב.');
      signal.throwIfAborted();
      setDownload({label:'פתיחת המיקרופון', bytes:0, total:0});
      await mic.start(ingredients, steps);
      signal.throwIfAborted();
      setPhase('listening');
      events.current.read();
    } catch (error) {
      if (!signal.aborted) events.current.failed(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'נדרשת הרשאת מיקרופון לליווי הקולי.' : error instanceof Error ? error.message : 'הפעלת הליווי נכשלה.');
    }
  }

  function toggleConversation() {
    if (voice.microphoneOn) setQueue([]);
    else if (cooking.stage === 'idle') void cooking.start();
    voice.toggleMicrophone();
  }
  const active = cooking.stage === 'ready' || cooking.stage === 'thinking';
  if (!steps.length) return null;

  return (
    <section aria-label="ליווי קולי למתכון" className="my-3 rounded-lg border border-secondary-100 bg-secondary-50/50 p-3 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-secondary-700">ליווי קולי לבישול</h4>
        <span className="text-sm text-secondary-600">שלב {voice.stepIndex + 1} מתוך {steps.length}</span>
      </div>
      {available && <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={phase === 'off' ? 'primary' : 'secondary'} disabled={phase === 'off' && (cooking.stage === 'loading' || cooking.stage === 'thinking')}
          onClick={phase === 'off' ? startConversation : voice.stop}>
          {phase === 'off' ? 'התחלת ליווי קולי' : phase === 'setup' ? 'ביטול הפעלת הליווי' : 'עצירת הליווי הקולי'}
        </Button>
        {phase === 'off' && <span className="text-xs text-secondary-600">בהפעלה הראשונה יורדו למכשיר קבצים חסרים, עד {Math.ceil((assetBytes+asrBytes+(voice.systemVoice ? 0 : noaBytes))/1e6)} מ״ב.</span>}
      </div>}
      {phase === 'setup' && <div role="status">{download.label}
        {download.total > 0 && <progress className="block w-full" aria-label={download.label}
          max={download.total} value={download.label === 'הכנת עוזר המתכון' ? cooking.bytes : download.bytes} />}
      </div>}
      {(phase === 'listening' || voice.microphoneOn) && <div>
        <span role="status">{voice.speaking ? 'מקריא · המיקרופון מושהה' : 'מקשיב'}</span>
        <p dir="auto" className={expanded ? undefined : 'line-clamp-2'}>{partial || voice.interim || voice.transcript}</p>
        {!expanded && cooking.reply && <p className="line-clamp-2">{cooking.reply}</p>}
        {voice.microphoneOn && <Button size="sm" onClick={voice.stop}>עצירת המיקרופון של הדפדפן</Button>}
      </div>}
      {(notice || (!expanded && voice.status)) && <p role="status">{notice || voice.status}</p>}
      <button type="button" aria-expanded={expanded} aria-controls={contentId}
        className="min-h-11 text-sm text-secondary-700 underline" onClick={() => setExpanded(value => !value)}>
        {expanded ? 'צמצום פרטי הליווי' : 'הצגת פרטי הליווי ואפשרויות נוספות'}
      </button>
      <div id={contentId} hidden={!expanded}><fieldset disabled={phase === 'setup'} className="space-y-3">
      <p className="leading-relaxed">{guidance[voice.stepIndex]}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={!voice.canSpeak} onClick={voice.read}>
          {voice.speaking ? 'הקרא שוב' : 'הקרא את השלב'}
        </Button>
        <Button variant="secondary" size="sm" onClick={voice.previous} disabled={voice.stepIndex === 0}>השלב הקודם</Button>
        <Button variant="secondary" size="sm" onClick={voice.next} disabled={voice.stepIndex === steps.length - 1}>השלב הבא</Button>
        <Button variant="ghost" size="sm" onClick={voice.restart}>מההתחלה</Button>
        {(voice.speaking || voice.microphoneOn) && <Button variant="ghost" size="sm" onClick={voice.stop}>עצור ליווי קולי</Button>}
      </div>
      {active ? <div className="space-y-3 border-t border-secondary-200 pt-3">
        <ul className="space-y-1">
          {recipe.actions.filter(a => a.step === voice.stepIndex).map(action => <li key={action.id} className="flex items-center justify-between gap-2">
            <span>{action.source}</span>
            <select aria-label={'מצב הפעולה ' + action.source} className="min-h-11 rounded border bg-white px-2" disabled={cooking.stage === 'thinking'}
              value={cooking.progress[action.id] ?? 'pending'} onChange={e => cooking.manual(action.id, e.target.value as Progress)}>
              {Object.entries(progressLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </li>)}
        </ul>
        {recipe.ingredients.length > 0 && <details className="rounded border bg-white p-2">
          <summary>מצרכים שסומנו ({recipe.ingredients.filter(i => cooking.progress[i.id] === 'done').length}/{recipe.ingredients.length})</summary>
          <ul>{recipe.ingredients.map(i => <li key={i.id} className="flex items-center justify-between gap-2 py-1">
            <span>{i.label}{cooking.portions[i.id] !== undefined && <small> · נוספו {Number((100*cooking.portions[i.id]).toFixed(1))}%</small>}</span>
            <select aria-label={'מצב המצרך ' + i.name} value={cooking.progress[i.id] ?? 'pending'} disabled={cooking.stage === 'thinking'}
              onChange={e => cooking.manual(i.id, e.target.value as Progress)}>
              {Object.entries(progressLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </li>)}</ul>
        </details>}
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void cooking.submit(text, voice.stepIndex, session.current ? voice.speak : undefined, voice.focus); }}>
          <label className="block"><span>שאלה או עדכון למתכון</span>
            <textarea className="mt-1 block w-full rounded border p-2" rows={2} maxLength={600} value={text}
              disabled={cooking.stage === 'thinking'} onChange={e => { cooking.dismiss(); setText(e.target.value); }} />
          </label>
          <Button type="submit" size="sm" disabled={!text.trim() || cooking.stage === 'thinking'}>{cooking.stage === 'thinking' ? 'מעבד במכשיר…' : 'שליחה לעוזר'}</Button>
        </form>
        {cooking.proposal && <div className="rounded-lg border bg-white p-3 space-y-2">
          <strong>עדכון מוצע</strong>
          <ul>{cooking.proposal.answer.writes.map(w => <li key={w.action}>{recipe.actions.find(a => a.id === w.action)?.source} · {progressLabel[w.status]}</li>)}</ul>
          <div className="flex gap-2"><Button size="sm" onClick={() => cooking.confirm(voice.stepIndex, voice.focus)}>אישור העדכון</Button>
            <Button variant="ghost" size="sm" onClick={cooking.dismiss}>ביטול</Button></div>
        </div>}
        {cooking.reply && <div className="space-y-1"><p role="status">{cooking.reply}</p>
          {voice.canSpeak && <Button variant="ghost" size="sm" onClick={() => voice.speak(cooking.reply)}>הקראת התשובה</Button>}</div>}
      </div> : <div className="space-y-1">
        <Button size="sm" variant="secondary" disabled={cooking.stage === 'loading'} onClick={() => void cooking.start()}>
          {cooking.stage === 'loading' ? 'טוען את העוזר…' : 'הפעלת עוזר המתכון'}
        </Button>
        {text && <p className="text-sm">התמלול מוכן. הפעילו את עוזר המתכון כדי לבדוק ולשלוח אותו.</p>}
        {cooking.stage === 'loading' ? <progress className="block w-full" max={assetBytes} value={cooking.bytes} aria-label="טעינת מנוע הבישול" />
          : <p className="text-xs text-secondary-600">בהפעלה הראשונה יישמרו במכשיר כ־90 מ״ב לשאלות ולעדכוני בישול.</p>}
      </div>}
      {cooking.error && <p role="alert" className="text-red-700">{cooking.error}</p>}
      {phase === 'off' && <>
      <LocalRecipeMicrophone steps={steps} ingredients={ingredients} disabled={voice.speaking || cooking.stage === 'thinking' || cooking.stage === 'loading'}
        interrupt={interrupt} stopVoice={voice.startLocalMic} onTranscript={voice.acceptTranscript} />
      {voice.canListen && (
        <details><summary className="cursor-pointer text-sm">פקודות קוליות דרך שירות הדפדפן</summary>
          <Button variant={voice.microphoneOn ? 'primary' : 'secondary'} size="sm" aria-pressed={voice.microphoneOn} onClick={toggleConversation}>
            {voice.microphoneOn ? 'כבה מיקרופון' : 'הפעל זיהוי דיבור שעשוי לשלוח שמע לשירות הדפדפן'}
          </Button>
          <p className="text-xs text-secondary-600">
            אחרי הפעלת המיקרופון, אפשר לומר: „שמתי קמח, מה עכשיו?”, „חזור על השלב”, „השלב הקודם” או „עצור”.
            כשנדרש אישור אפשר לענות „כן” או „לא”. ההאזנה פועלת כשהמסך פתוח, בין ההקראות.
            זיהוי הדיבור עשוי להשתמש בשירות של הדפדפן ולדרוש חיבור לאינטרנט.
          </p>
        </details>
      )}
      <RecipeNarrationSettings system={voice.systemVoice} installed={voice.installed} usingNoa={voice.usingNoa}
        setInstalled={voice.setInstalled} choose={voice.chooseVoice} />
      </>}
      <div role="status" className="text-sm text-secondary-600">
        {voice.status || (voice.listening ? 'מקשיב לפקודה…' : voice.speaking ? 'מקריא את השלב…' : voice.microphoneOn ? 'המיקרופון פעיל; ממתין לסיום ההקראה…' : '')}
      </div>
      {voice.transcript && <p className="text-xs text-secondary-500">נשמע: {voice.transcript}</p>}
      </fieldset></div>
    </section>
  );
}

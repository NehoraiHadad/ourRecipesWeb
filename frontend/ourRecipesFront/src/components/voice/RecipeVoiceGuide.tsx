'use client';
import { useState } from 'react';
import { localVoiceCommand } from '@/lib/voice/voiceCommands';
import { allActions, cookingPrompt, cookingProposalSchema, cookingProposalGrammar, decodeCookingProposal, cookingReply, initialCookingState, updateActions, validateProposal, type CookingProposal, type CookingRecipe } from '@/lib/voice/cookingState';
import { modelBytes, type LlmChoice } from '@/lib/voice/models';
import { useRecipeVoice } from './useRecipeVoice';

const button = 'rounded-lg border border-stone-300 px-4 py-2 min-h-[44px] bg-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700';
export default function RecipeVoiceGuide({ recipe }: { recipe: CookingRecipe }) {
  const voice = useRecipeVoice();
  const [state, setState] = useState(() => initialCookingState(recipe));
  const [reviewed, setReviewed] = useState(false);
  const [text, setText] = useState('');
  const [previous, setPrevious] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CookingProposal | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const blocked = voice.busy || !!voice.download;
  const readyForModel = reviewed && (voice.status.llm !== 'missing' || localVoiceCommand(text) !== null);
  function manual(actionId: string, done: boolean) {
    voice.stopSpeech(); setProposal(null); setReply(''); setState(s => updateActions(recipe, s, [{ actionId, done }]));
  }
  async function submit() {
    if (!text.trim() || blocked || !readyForModel) return;
    voice.stopSpeech(); setError(''); setProposal(null);
    const command = localVoiceCommand(text);
    if (command) { setReply(cookingReply(recipe, state, command)); return; }
    const raw = await voice.generate(cookingPrompt(recipe, state, text.trim(), previous), cookingProposalSchema(recipe, state, text.trim()), cookingProposalGrammar(recipe, state, text.trim()));
    if (!raw) return;
    try {
      const p = validateProposal(decodeCookingProposal(JSON.parse(raw), recipe), recipe, state, text.trim());
      setPrevious(text.trim());
      if (p.intent === 'report') { setProposal(p); setReply('זוהתה הצעה לעדכון. יש לבדוק ולאשר את הפעולות למטה.'); }
      else setReply(cookingReply(recipe, state, p.intent));
    } catch { setError('המודל לא החזיר עדכון תקין. לא שינינו את ההתקדמות. מה בדיוק עשית ומה נותר? אפשר לסמן ידנית.'); }
  }
  function confirm() {
    if (!proposal) return;
    try {
      validateProposal(proposal, recipe, state, text.trim());
      const next = updateActions(recipe, state, proposal.changes); setState(next); setProposal(null);
      setReply(cookingReply(recipe, next, 'next'));
    } catch (e) { setProposal(null); setError(e instanceof Error ? e.message : String(e)); }
  }
  const receiveTranscript = (transcript: string) => { setText(transcript); setProposal(null); setReply(transcript ? 'זה התמלול. אפשר לתקן אותו לפני שליחה לעוזר המקומי.' : 'לא זוהה דיבור. אפשר להקליד.'); };
  return <section dir="rtl" className="space-y-5 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-label="עוזר בישול ניסיוני">
    <h2 className="text-2xl font-bold">עוזר בישול בעברית · ניסוי מקומי</h2>
    <p>אודיו וטקסט נשארים במכשיר. לחיצה על הורדה פונה ל־Hugging Face להורדת משקולות בלבד. איכות העברית וזמן התגובה עדיין בבדיקה. ההתקדמות נשמרת בזיכרון עד סגירת המסך או החלפת מתכון.</p>
    <p className="font-semibold">{recipe.title}</p>
    <div className="space-y-3">
      <p>לפני הניסוי: בדקו שחלוקת הפעולות תואמת למתכון. אם פעולה כוללת כמה דברים, דיווח חלקי דורש הבהרה. אפשר לערוך את טקסט הדוגמה למעלה.</p>
      <label className="flex gap-2 items-center"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />בדקתי את חלוקת הפעולות</label>
      <p>שלב נוכחי: {state.currentStep + 1} · הושלמו {state.completed.length} · נותרו {state.remaining.length}</p>
      <ol className="space-y-3">
        {recipe.steps.map((step, i) => <li key={step.id} className={`rounded-xl p-3 border ${i === state.currentStep ? 'border-amber-700 bg-white' : 'border-stone-200'}`}>
          <p><strong>שלב {i + 1}: </strong>{step.text}</p>
          {step.actions.map(action => <label key={action.id} className="flex items-center gap-2 min-h-[44px]">
            <input type="checkbox" checked={state.completed.includes(action.id)} disabled={blocked} onChange={e => manual(action.id, e.target.checked)} />{action.text}
          </label>)}
        </li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={blocked || state.currentStep === 0} onClick={() => { voice.stopSpeech(); setProposal(null); setState(s => ({ ...s, revision: s.revision + 1, currentStep: s.currentStep - 1 })); }}>לשלב הקודם</button>
        <button className={button} disabled={blocked || state.currentStep >= recipe.steps.length - 1} onClick={() => { voice.stopSpeech(); setProposal(null); setState(s => ({ ...s, revision: s.revision + 1, currentStep: s.currentStep + 1 })); }}>לשלב הבא בלי לסמן השלמה</button>
        <button className={button} onClick={() => { voice.stopSpeech(); setReply(cookingReply(recipe, state, 'next')); }}>מה עכשיו?</button>
        <button className={button} onClick={() => { voice.stopSpeech(); setReply(cookingReply(recipe, state, 'missed')); }}>מה טרם סומן בשלבים קודמים?</button>
      </div>
    </div>
    <details className="rounded-xl border p-3" open>
      <summary className="cursor-pointer font-semibold">מודלים מקומיים · הורדה וביטול</summary>
      {!voice.supported && <p role="status">הרצה מקומית אינה זמינה כאן. אפשר להמשיך בכפתורים ובסימון הפעולות.</p>}
      <label className="block my-3">מועמד להבנת השיחה<select aria-label="מועמד להבנת השיחה" className="border rounded p-2 mx-2" value={voice.llmChoice} disabled={blocked || voice.speaking} onChange={e => { setProposal(null); voice.changeLlm(e.target.value as LlmChoice); }}><option value="qwen35-2b">Qwen3.5 2B · 1.28 GB</option><option value="qwen35">Qwen3.5 0.8B · 533 MB</option><option value="dicta">DictaLM 1.7B · 1.11 GB</option></select></label>
      {(['asr', 'llm', 'tts'] as const).map(kind => <div key={kind} className="my-3 space-y-2">
        <p>{kind === 'asr' ? 'תמלול Zipformer2' : kind === 'llm' ? `מודל שפה ${voice.llmChoice === 'dicta' ? 'DictaLM 1.7B' : voice.llmChoice === 'qwen35' ? 'Qwen3.5 0.8B' : 'Qwen3.5 2B'}, ניסיוני` : 'הקראה Pocket בעברית, ניסיונית'} · {(modelBytes(voice.models[kind]) / 1e6).toFixed(1)} MB · {({ missing: 'טרם הורד', cached: 'במטמון', loading: 'טוען לזיכרון', ready: 'מוכן בזיכרון' })[voice.status[kind]]}</p>
        <p className="text-sm" dir="ltr">{voice.models[kind].license}</p>
        {kind === 'llm' && <p className="text-sm">המועמדים עדיין לא עברו את בדיקת הדיוק בעברית. נדרשים הורדה גדולה וזיכרון נוסף; במעבד ענן התגובות ארכו עשרות שניות. כל עדכון דורש בדיקה ואישור.</p>}
        <button className={button} disabled={!voice.supported || blocked || voice.status[kind] !== 'missing'} onClick={() => void voice.prepare(kind)}>הורדת {kind === 'asr' ? 'מודל תמלול' : kind === 'llm' ? 'מודל שפה' : 'מודל הקראה'}</button>
        {voice.download?.kind === kind && <div role="status"><progress className="w-full" value={voice.download.bytes} max={modelBytes(voice.models[kind])} aria-label={`התקדמות הורדת ${kind}`} /><p>{(voice.download.bytes / 1e6).toFixed(1)} מתוך {(modelBytes(voice.models[kind]) / 1e6).toFixed(1)} MB</p></div>}
      </div>)}
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => { voice.cancel(); setProposal(null); }}>ביטול ושחרור זיכרון</button>
        <button className={button} disabled={!voice.supported} onClick={() => { setProposal(null); void voice.remove(); }}>מחיקת כל המודלים מהדפדפן</button>
      </div>
      <p className="text-sm mt-2">Zipformer2 פותח בידי Yakov Kolani; ייצוא ONNX נוסף בידי ivrit.ai. <a className="underline" href="https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he" target="_blank" rel="noreferrer">מקור, רישיון וקרדיט</a>. DictaLM ברישיון Apache-2.0; מתאם Pocket ו־ReNikud ברישיון CC-BY-4.0. קול המערכת כפוף לתנאי המכשיר.</p>
    </details>
    <div className="space-y-2">
      <label className="block font-semibold" htmlFor="cooking-report">מה עשית או מה רצית לשאול?</label>
      <textarea id="cooking-report" className="w-full rounded-xl border p-3" rows={3} maxLength={600} disabled={voice.busy} value={text} onChange={e => { setText(e.target.value); setProposal(null); }} placeholder="הוספתי מים אבל עוד לא ערבבתי" />
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={!readyForModel || !text.trim() || blocked} onClick={() => void submit()}>שליחה לעוזר המקומי</button>
        <button className={button} disabled={!reviewed || !voice.canRecord || !voice.supported || voice.status.asr === 'missing' || (!!voice.download) || (voice.busy && !voice.recording) || voice.speaking} onClick={() => voice.recording ? void voice.stopRecording(receiveTranscript) : void voice.startRecording(receiveTranscript)}>{voice.recording ? 'סיום ותמלול' : 'הקלטה עד 20 שניות'}</button>
      </div>
      {!voice.canRecord && <p>המיקרופון אינו נתמך כאן. אפשר להקליד ולסמן פעולות.</p>}
      <p className="text-sm">אפשר לשאול ״מה עכשיו?״ ו״על איזה שלב דילגתי?״ גם לפני הורדת מודל שפה. ההקלטה נעצרת לפני תמלול והקראה. תמלול מוצג לתיקון לפני שליחה למודל.</p>
    </div>
    {proposal && <div className="rounded-xl border border-amber-700 bg-white p-3 space-y-2" aria-label="הצעה לאישור">
      <p className="font-semibold">הצעת המודל — בדקו לפני אישור</p>
      <ul>{proposal.changes.map(c => <li key={c.actionId}>{c.done ? 'הושלמה' : 'טרם הושלמה'}: {allActions(recipe).find(a => a.id === c.actionId)?.text} · על בסיס ״{c.evidence}״</li>)}</ul>
      <button className={button} onClick={confirm}>אישור עדכון ההתקדמות</button>{' '}
      <button className={button} onClick={() => { setProposal(null); setReply(cookingReply(recipe, state, 'clarify')); }}>לא מדויק, נדרשת הבהרה</button>
    </div>}
    <p role="status" aria-live="polite">{reply}</p>
    {(error || voice.error) && <p role="alert" className="text-red-800">{error || voice.error}</p>}
    <div className="flex flex-wrap gap-2 items-center">
      <label>הקראה<select aria-label="סוג הקראה" className="border rounded p-2 mx-2" value={voice.speechMode} disabled={voice.busy || voice.speaking} onChange={e => { voice.stopSpeech(); voice.setSpeechMode(e.target.value as 'system' | 'pocket'); }}><option value="system">קול עברי מקומי במכשיר</option><option value="pocket" disabled={voice.status.tts === 'missing'}>Pocket עברית לאחר הורדה</option></select></label>
      <button className={button} disabled={!reply || (voice.speechMode === 'system' ? !voice.voices.length : voice.status.tts === 'missing') || blocked || !!proposal} onClick={() => voice.speak(reply)}>הקראת התשובה</button>
      <button className={button} disabled={!voice.speaking} onClick={voice.stopSpeech}>עצירת הקראה</button>
      <p>{voice.speechMode === 'pocket' ? 'Pocket עברית · קול עומר · הקראה במכשיר בלבד' : voice.voices.length ? `קול עברי מקומי: ${voice.voices[0].name}` : 'לא נמצא קול עברי מקומי. התשובה זמינה בטקסט.'}</p>
    </div>
    <details className="rounded-xl border p-3"><summary>מדידות מקומיות ומצב מפורש</summary>
      <p>זמני אמת מהרצה במכשיר הזה בלבד. RTF = זמן תמלול / משך האודיו. אין כאן מדידת זיכרון כולל או איכות עברית אוטומטית.</p>
      <pre dir="ltr" className="overflow-auto text-xs whitespace-pre-wrap">{JSON.stringify({ state, measurements: voice.measurements }, null, 2)}</pre>
    </details>
  </section>;
}

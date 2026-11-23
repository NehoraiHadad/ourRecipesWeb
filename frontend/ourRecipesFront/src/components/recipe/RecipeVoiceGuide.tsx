'use client';

import { useState } from 'react';
import { useCompactCooking, progressLabel } from '@/hooks/useCompactCooking';
import { assetBytes, type ActiveRecipe, type Progress } from '@/lib/voice/compactEngine';
import { recipeVoiceCommand } from '@/lib/recipes/voiceCommands';
import { Button } from '@/components/ui/Button';
import { useRecipeVoice } from '@/hooks/useRecipeVoice';

export default function RecipeVoiceGuide({ steps, recipe }: { steps: string[]; recipe: ActiveRecipe }) {
  const cooking = useCompactCooking(recipe);
  const [text, setText] = useState('');
  const voice = useRecipeVoice(steps, (heard, step, speak) => {
    const command = heard.trim().replace(/[.!?״]+$/g, '');
    // Pure navigation remains available even before downloading the model.
    if (recipeVoiceCommand(heard) === 'stop' ||
        /^(?:(?:תתחיל[י]? |התחל[י]? )?מההתחלה|התחל[י]? מחדש|(?:חזור|חזרי|תחזור|תחזרי)(?: על השלב)?|(?:השלב |שלב )?(?:הקודם|הבא)|אפשר להמשיך|תמשיך|תמשיכי)$/.test(command)) return false;
    if (cooking.stage === 'idle') return false;
    if (cooking.stage === 'ready') { setText(heard); void cooking.submit(heard, step, speak); }
    return true;
  });
  const active = cooking.stage === 'ready' || cooking.stage === 'thinking';
  if (!steps.length) return null;

  return (
    <section aria-label="ליווי קולי למתכון" className="my-3 rounded-lg border border-secondary-100 bg-secondary-50/50 p-3 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-secondary-700">ליווי קולי לבישול</h4>
        <span className="text-sm text-secondary-600">שלב {voice.stepIndex + 1} מתוך {steps.length}</span>
      </div>
      <p className="leading-relaxed">{steps[voice.stepIndex]}</p>
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
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); void cooking.submit(text, voice.stepIndex); }}>
          <label className="block"><span>שאלה או עדכון למתכון</span>
            <textarea className="mt-1 block w-full rounded border p-2" rows={2} maxLength={600} value={text}
              disabled={cooking.stage === 'thinking'} onChange={e => { cooking.dismiss(); setText(e.target.value); }} />
          </label>
          <Button type="submit" size="sm" disabled={!text.trim() || cooking.stage === 'thinking'}>{cooking.stage === 'thinking' ? 'מעבד במכשיר…' : 'שליחה לעוזר'}</Button>
        </form>
        {cooking.proposal && <div className="rounded-lg border bg-white p-3 space-y-2">
          <strong>עדכון מוצע</strong>
          <ul>{cooking.proposal.answer.writes.map(w => <li key={w.action}>{recipe.actions.find(a => a.id === w.action)?.source} · {progressLabel[w.status]}</li>)}</ul>
          <div className="flex gap-2"><Button size="sm" onClick={cooking.confirm}>אישור העדכון</Button>
            <Button variant="ghost" size="sm" onClick={cooking.dismiss}>ביטול</Button></div>
        </div>}
        {cooking.reply && <div className="space-y-1"><p role="status">{cooking.reply}</p>
          {voice.canSpeak && <Button variant="ghost" size="sm" onClick={() => voice.speak(cooking.reply)}>הקראת התשובה</Button>}</div>}
      </div> : <div className="space-y-1">
        <Button size="sm" variant="secondary" disabled={cooking.stage === 'loading'} onClick={() => void cooking.start()}>
          {cooking.stage === 'loading' ? 'טוען את העוזר…' : 'הפעלת עוזר המתכון'}
        </Button>
        {cooking.stage === 'loading' ? <progress className="block w-full" max={assetBytes} value={cooking.bytes} aria-label="טעינת מנוע הבישול" />
          : <p className="text-xs text-secondary-600">בהפעלה הראשונה יישמרו במכשיר כ־90 מ״ב לשאלות ולעדכוני בישול.</p>}
      </div>}
      {cooking.error && <p role="alert" className="text-red-700">{cooking.error}</p>}
      {voice.canListen ? (
        <>
          <Button variant={voice.microphoneOn ? 'primary' : 'secondary'} size="sm" aria-pressed={voice.microphoneOn} onClick={voice.toggleMicrophone}>
            {voice.microphoneOn ? 'כבה מיקרופון' : 'הפעל פקודות קוליות'}
          </Button>
          <p className="text-xs text-secondary-600">
            אחרי הפעלת המיקרופון, אפשר לומר: „שמתי קמח, מה עכשיו?”, „חזור על השלב”, „השלב הקודם” או „עצור”.
            כשעוזר המתכון פעיל אפשר גם לשאול על ההוראות ולדווח על פעולה שבוצעה. ההאזנה פועלת כשהמסך פתוח, בין ההקראות.
            זיהוי הדיבור עשוי להשתמש בשירות של הדפדפן ולדרוש חיבור לאינטרנט.
          </p>
        </>
      ) : <p className="text-xs text-secondary-600">זיהוי דיבור אינו זמין בדפדפן הזה. אפשר לעבור בין השלבים בכפתורים.</p>}
      {!voice.canSpeak && <p className="text-xs text-secondary-600">הקראה אינה זמינה בדפדפן הזה. אפשר לקרוא את השלב ולעבור בכפתורים.</p>}
      <div role="status" className="text-sm text-secondary-600">
        {voice.status || (voice.listening ? 'מקשיב לפקודה…' : voice.speaking ? 'מקריא את השלב…' : voice.microphoneOn ? 'המיקרופון פעיל; ממתין לסיום ההקראה…' : '')}
      </div>
      {voice.transcript && <p className="text-xs text-secondary-500">נשמע: {voice.transcript}</p>}
    </section>
  );
}

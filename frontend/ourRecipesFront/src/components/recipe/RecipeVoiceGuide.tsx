'use client';

import { Button } from '@/components/ui/Button';
import { useRecipeVoice } from '@/hooks/useRecipeVoice';

export default function RecipeVoiceGuide({ steps }: { steps: string[] }) {
  const voice = useRecipeVoice(steps);
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
      {voice.canListen ? (
        <>
          <Button variant={voice.microphoneOn ? 'primary' : 'secondary'} size="sm" aria-pressed={voice.microphoneOn} onClick={voice.toggleMicrophone}>
            {voice.microphoneOn ? 'כבה מיקרופון' : 'הפעל פקודות קוליות'}
          </Button>
          <p className="text-xs text-secondary-600">
            אחרי הפעלת המיקרופון, אפשר לומר: „שמתי קמח, מה עכשיו?”, „חזור על השלב”, „השלב הקודם” או „עצור”.
            כל בקשת המשך עוברת שלב אחד לפי סדר המתכון. ההאזנה פועלת כשהמסך פתוח, בין ההקראות.
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

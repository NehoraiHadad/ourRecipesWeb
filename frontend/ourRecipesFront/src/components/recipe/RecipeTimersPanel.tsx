/**
 * The timer panel of the recipe view: running timers, a manual timer, and one
 * ready-made timer per waiting period detected in the preparation steps
 * (`lib/recipes/waitTimes`, which reads the structured `instructions` field).
 */
import React, { useMemo, useState } from 'react';
import { useTimer } from '@/context/TimerContext';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { detectWaitInstructions } from '@/lib/recipes/waitTimes';
import ActiveTimerRow from './ActiveTimerRow';

interface RecipeTimersPanelProps {
  recipeId: string;
  recipeName: string;
  recipeUrl?: string;
  instructions?: string | null;
  preparationTime?: number | null;
  /** The new-timer form only shows while the prep-time chip is toggled on. */
  showForm: boolean;
}

const MUTED_PATH = 'M23 9l-6 6M17 9l6 6';
const WAVES_PATH = 'M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07';

const SoundIcon: React.FC<{ muted: boolean }> = ({ muted }) => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d={muted ? MUTED_PATH : WAVES_PATH} />
  </svg>
);

const RecipeTimersPanel: React.FC<RecipeTimersPanelProps> = ({
  recipeId,
  recipeName,
  recipeUrl,
  instructions,
  preparationTime,
  showForm
}) => {
  const { isReady, getRecipeTimers, addTimer, isSoundMuted, toggleSound,
    requestNotificationPermission, keepScreenOn, setKeepScreenOn, screenLock, alarmPlatform,
    pushStatus, pushErrorStatus, disablePush } = useTimer();
  const [newTimerMinutes, setNewTimerMinutes] = useState(preparationTime || 0);

  const activeTimers = getRecipeTimers(recipeId);
  const waitInstructions = useMemo(() => detectWaitInstructions(instructions), [instructions]);

  if (!showForm && activeTimers.length === 0) return null;

  const startTimer = (stepNumber: number, minutes: number, description: string) =>
    addTimer({ stepNumber, timeLeft: minutes * 60, description, recipeId, recipeName, recipeUrl });

  return (
    <div className="w-full">
      <p className="text-xs text-secondary-600 my-2" role="note">
        {alarmPlatform === 'web'
          ? pushStatus === 'ready' ? 'התראות ברקע מופעלות גם כשהמסך כבוי. נדרש חיבור לרשת; המסירה עשויה להתעכב בהתאם לרשת ולהגדרות המכשיר.'
            : 'אפשרו התראות ברקע כדי לקבל הודעה בסיום גם כשהמסך כבוי. הזמן נשמר במכשיר גם ללא התראות.'
          : 'אפשרו התראות ותזמון מדויק כדי לקבוע התראת סיום במכשיר, גם כשהמסך כבוי. הצליל כפוף להגדרות ההתראות והמכשיר.'}
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        {screenLock.supported && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={keepScreenOn} onChange={event => setKeepScreenOn(event.target.checked)} />
            השאר מסך דולק בזמן שהטיימר רץ
          </label>
        )}
        {alarmPlatform === 'web' && pushStatus === 'ready'
          ? <Button variant="ghost" size="sm" onClick={() => void disablePush()}>בטל התראות ברקע</Button>
          : <Button variant="ghost" size="sm" onClick={() => void requestNotificationPermission()}
              disabled={alarmPlatform === 'web' && ['loading', 'unsupported', 'install-required', 'unavailable'].includes(pushStatus)}>
              {alarmPlatform === 'web' ? 'אפשר התראות ברקע' : 'אפשר התראות ותזמון במכשיר'}
            </Button>}
      </div>
      {alarmPlatform === 'web' && pushStatus === 'install-required' && <p role="status" className="text-xs text-secondary-600 mb-2">ב־iPhone: לחצו על שיתוף, בחרו ״הוסף למסך הבית״ ופתחו את האפליקציה מהסמל כדי לאפשר התראות.</p>}
      {alarmPlatform === 'web' && pushStatus === 'unsupported' && <p role="status" className="text-xs text-secondary-600 mb-2">התראות ברקע אינן נתמכות בדפדפן הזה. אפשר להשתמש בטיימר של המכשיר.</p>}
      {alarmPlatform === 'web' && pushStatus === 'unavailable' && <p role="status" className="text-xs text-secondary-600 mb-2">התראות ברקע אינן זמינות כרגע. הטיימר ממשיך לפעול במסך הפתוח.</p>}
      {alarmPlatform === 'web' && pushStatus === 'error' && <p role="status" className="text-xs text-secondary-600 mb-2">{pushErrorStatus === 401 ? 'יש להתחבר לאפליקציה כדי להפעיל התראות ברקע.' : 'לא ניתן להתחבר להתראות כרגע. בדקו את החיבור לרשת ונסו שוב.'}</p>}
      {keepScreenOn && screenLock.failed && (
        <p role="status" className="text-xs text-secondary-600 mb-2">המכשיר לא אישר להשאיר את המסך דולק. כדאי להפעיל גם טיימר במכשיר.</p>
      )}
      {activeTimers.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center justify-center w-8 h-8 rounded-full text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50"
              onClick={toggleSound}
              title={isSoundMuted ? 'הפעל צליל' : 'השתק צליל'}
            >
              <SoundIcon muted={isSoundMuted} />
            </Button>
          </div>
          {activeTimers.map((timer) => (
            <div key={timer.id}>
              <ActiveTimerRow timer={timer} />
              {alarmPlatform === 'web' && (timer.pushState || pushStatus === 'ready') && (
                <p role={timer.pushState === 'error' ? 'alert' : 'status'} className="text-xs text-secondary-600 mt-1">
                  {timer.pendingDelete ? 'ממתין לאישור ביטול ההתראה. נדרש חיבור לרשת.'
                    : timer.pushState === 'scheduled' ? 'התראת סיום נקבעה ברקע'
                    : timer.pushState === 'paused' ? 'ההתראה ברקע הושהתה'
                    : timer.pushState === 'error' ? 'עדכון ההתראה ברקע נכשל. התראה קודמת עלולה להישלח עד שיתחדש החיבור.'
                    : timer.pushState === 'expired' ? 'זמן הטיימר הסתיים'
                    : 'מעדכן את ההתראה ברקע…'}
                </p>
              )}
              {alarmPlatform !== 'web' && !timer.isPaused && (
                <p role="status" className="text-xs text-secondary-600 mt-1">
                  {timer.alarmState === 'scheduled' ? 'התראת סיום נקבעה במכשיר'
                    : timer.alarmState === 'permission-required' ? 'לא נקבעה התראה: יש לאפשר התראות במכשיר'
                    : timer.alarmState === 'exact-permission-required' ? 'לא נקבעה התראה: יש לאפשר תזמון מדויק במכשיר'
                    : timer.alarmState === 'error' ? 'עדכון ההתראה נכשל; ייתכן שהתראה קודמת עדיין פעילה. נסו לאפשר התראות שוב.'
                    : 'קובע התראת סיום במכשיר…'}
                </p>
              )}
              {alarmPlatform !== 'web' && timer.isPaused && timer.alarmState === 'error' && (
                <p role="alert" className="text-xs text-red-600 mt-1">ביטול ההתראה נכשל; ייתכן שהיא עדיין פעילה. נסו לאפשר התראות שוב.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="animate-in slide-in-from-top duration-300">
          <div className="bg-secondary-50/50 rounded-lg p-3 border border-secondary-100 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={newTimerMinutes}
                onChange={(e) => setNewTimerMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 px-3 py-2 text-lg font-mono text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
                min="1"
                placeholder="דקות"
                aria-label="משך הטיימר בדקות"
              />
              <Button
                variant="primary"
                onClick={() =>
                  startTimer(
                    activeTimers.length + 1,
                    newTimerMinutes,
                    `טיימר ${activeTimers.length + 1}`
                  )
                }
                className="px-4"
                disabled={!isReady || newTimerMinutes <= 0}
              >
                <Typography variant="body" className="font-handwriting-amit">הפעל טיימר</Typography>
              </Button>
            </div>

            {waitInstructions.length > 0 && (
              <div className="space-y-2">
                <Typography variant="body" className="text-sm text-secondary-600">
                  נמצאו {waitInstructions.length} זמני המתנה בהוראות ההכנה:
                </Typography>
                {waitInstructions.map((instruction, index) => {
                  const isActive = activeTimers.some(
                    (timer) => timer.description === instruction.description
                  );

                  return (
                    <div
                      key={index}
                      className="flex items-center gap-2 bg-white/50 rounded-lg p-2 border border-secondary-100"
                    >
                      <div className="flex-1 min-w-0">
                        <Typography variant="body" className="text-sm text-secondary-700 line-clamp-1">
                          {instruction.description}
                        </Typography>
                        <Typography variant="body" className="text-xs text-secondary-500">
                          {instruction.minutes} דקות
                        </Typography>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          startTimer(instruction.stepNumber, instruction.minutes, instruction.description)
                        }
                        disabled={!isReady || isActive}
                        className="whitespace-nowrap"
                      >
                        <Typography variant="body" className={`text-sm ${isActive ? 'text-secondary-500' : ''}`}>
                          {isActive ? 'נוסף ✓' : 'הפעל טיימר'}
                        </Typography>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeTimersPanel;

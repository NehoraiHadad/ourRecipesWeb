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
  instructions,
  preparationTime,
  showForm
}) => {
  const { getRecipeTimers, addTimer, isSoundMuted, toggleSound } = useTimer();
  const [newTimerMinutes, setNewTimerMinutes] = useState(preparationTime || 0);

  const activeTimers = getRecipeTimers(recipeId);
  const waitInstructions = useMemo(() => detectWaitInstructions(instructions), [instructions]);

  if (!showForm && activeTimers.length === 0) return null;

  const startTimer = (stepNumber: number, minutes: number, description: string) =>
    addTimer({ stepNumber, timeLeft: minutes * 60, description, recipeId, recipeName });

  return (
    <div className="w-full">
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
            <ActiveTimerRow key={timer.id} timer={timer} />
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
                disabled={newTimerMinutes <= 0}
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
                        disabled={isActive}
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

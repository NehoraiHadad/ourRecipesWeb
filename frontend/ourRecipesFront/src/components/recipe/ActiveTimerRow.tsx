/**
 * One running timer inside the recipe view: remaining time, an editable name,
 * pause/resume and delete. Extracted from `RecipeDisplay` during stage D.
 */
import React, { useState } from 'react';
import type { Timer } from '@/context/TimerContext';
import { useTimer } from '@/context/TimerContext';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { useFont } from '@/context/FontContext';

const PlayIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PauseIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const ActiveTimerRow: React.FC<{ timer: Timer }> = ({ timer }) => {
  const { removeTimer, updateTimer, pauseTimer, resumeTimer } = useTimer();
  const { currentFont } = useFont();
  const [editingName, setEditingName] = useState<string | null>(null);

  const isUrgent = timer.timeLeft <= 10 && !timer.isPaused;

  return (
    <div
      className={`flex items-center gap-3 bg-secondary-50/50 rounded-lg p-2 border border-secondary-100
        ${isUrgent ? 'animate-pulse border-red-200 bg-red-50/50' : ''}`}
    >
      <div
        className={`font-mono text-base font-medium bg-white px-2 py-1 rounded-md shadow-sm
          ${timer.isPaused ? 'text-secondary-600' : isUrgent ? 'text-red-600' : 'text-primary-600'}`}
      >
        {Math.floor(timer.timeLeft / 60)}:{(timer.timeLeft % 60).toString().padStart(2, '0')}
      </div>

      {editingName !== null ? (
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            void updateTimer(timer.id, { description: editingName });
            setEditingName(null);
          }}
        >
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary-300"
            autoFocus
            onBlur={() => setEditingName(null)}
          />
        </form>
      ) : (
        <Typography
          variant="body"
          className={`font-handwriting-${currentFont} text-sm text-secondary-700 flex-1 min-w-0 line-clamp-1`}
        >
          <div
            className="cursor-pointer hover:text-primary-600"
            onClick={() => setEditingName(timer.description)}
          >
            {timer.description}
          </div>
        </Typography>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors
            ${timer.isPaused ? 'text-primary-600 hover:bg-primary-50' : 'text-secondary-600 hover:bg-secondary-50'}`}
          onClick={() => (timer.isPaused ? resumeTimer(timer.id) : pauseTimer(timer.id))}
          title={timer.isPaused ? 'המשך' : 'השהה'}
        >
          {timer.isPaused ? <PlayIcon /> : <PauseIcon />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center justify-center w-8 h-8 rounded-full text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50"
          onClick={() => removeTimer(timer.id)}
          title="מחק טיימר"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </Button>
      </div>
    </div>
  );
};

export default ActiveTimerRow;

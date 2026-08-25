/**
 * The 1X / 2X control that scales the ingredient quantities
 * (STRUCTURE_REFACTOR_TASKS.md §D1). Half-step increments, clamped to
 * 0.5X–4X; the scaling itself lives in `lib/recipes/servingsScale`.
 */
import React from 'react';

export const MIN_MULTIPLIER = 0.5;
export const MAX_MULTIPLIER = 4;

interface ServingsMultiplierProps {
  value: number;
  onChange: (value: number) => void;
}

const ServingsMultiplier: React.FC<ServingsMultiplierProps> = ({ value, onChange }) => {
  const adjust = (delta: number) => {
    const next = Math.round((value + delta) * 2) / 2;
    onChange(Math.min(Math.max(next, MIN_MULTIPLIER), MAX_MULTIPLIER));
  };

  const buttonClass = `text-primary-600 hover:text-primary-700 hover:bg-primary-50/50
    w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center
    transition-all duration-200 relative
    focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-300/50
    disabled:opacity-40 disabled:cursor-not-allowed`;

  return (
    <div
      className="absolute sm:left-1 -left-4 -top-8 flex flex-col sm:flex-row items-center gap-0.5 bg-white/95 backdrop-blur
                 border border-primary-100 rounded-lg sm:rounded-full sm:py-1 sm:pl-1 sm:pr-2 p-1
                 shadow-sm hover:shadow-md transition-all duration-300 z-10"
    >
      <button
        onClick={() => adjust(-0.5)}
        className={buttonClass}
        disabled={value <= MIN_MULTIPLIER}
        title="הקטן כמויות"
      >
        <svg className="w-3 h-3 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round" />
        </svg>
      </button>
      <div className="w-8 sm:w-12 text-center font-medium text-primary-700 text-sm tabular-nums">
        {value}X
      </div>
      <button
        onClick={() => adjust(0.5)}
        className={buttonClass}
        disabled={value >= MAX_MULTIPLIER}
        title="הגדל כמויות"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="7" x2="12" y2="17" strokeLinecap="round" />
          <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};

export default ServingsMultiplier;

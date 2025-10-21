import React, { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';

export interface ProgressStep {
  id: string;
  label: string;
  estimatedDuration?: number; // in seconds
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentStepIndex: number;
  showEstimatedTime?: boolean;
  className?: string;
  variant?: 'bar' | 'steps' | 'minimal';
}

export function ProgressIndicator({
  steps,
  currentStepIndex,
  showEstimatedTime = true,
  className,
  variant = 'steps'
}: ProgressIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const totalEstimatedTime = steps.reduce(
    (acc, step) => acc + (step.estimatedDuration || 0),
    0
  );

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const progressPercentage = steps.length > 0
    ? (completedSteps / steps.length) * 100
    : 0;

  const currentStep = steps[currentStepIndex];
  const remainingTime = Math.max(0, totalEstimatedTime - elapsedTime);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} שניות`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}:${secs.toString().padStart(2, '0')} דקות` : `${minutes} דקות`;
  };

  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-500 border-t-transparent" />
        <div className="flex-1">
          <p className="text-sm text-secondary-700 font-medium">
            {currentStep?.label || 'מעבד...'}
          </p>
          {showEstimatedTime && remainingTime > 0 && (
            <p className="text-xs text-secondary-500">
              זמן משוער: {formatTime(remainingTime)}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'bar') {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Progress Bar */}
        <div className="relative w-full h-2 bg-secondary-100 rounded-full overflow-hidden">
          <div
            className="absolute top-0 right-0 h-full bg-gradient-to-l from-primary-500 to-primary-400
                     transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="absolute inset-0 bg-white/20 animate-shimmer" />
          </div>
        </div>

        {/* Current Step Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
            <p className="text-sm text-secondary-700 font-medium">
              {currentStep?.label || 'מעבד...'}
            </p>
          </div>
          <div className="text-xs text-secondary-500">
            {completedSteps}/{steps.length}
          </div>
        </div>

        {showEstimatedTime && remainingTime > 0 && (
          <p className="text-xs text-secondary-500 text-center">
            זמן משוער נותר: {formatTime(remainingTime)}
          </p>
        )}
      </div>
    );
  }

  // Default: 'steps' variant
  return (
    <div className={cn('space-y-4', className)}>
      {/* Steps List */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isCompleted = step.status === 'completed';
          const isError = step.status === 'error';

          return (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg transition-all duration-300',
                isActive && 'bg-primary-50 border border-primary-200',
                isCompleted && 'bg-green-50',
                isError && 'bg-red-50'
              )}
            >
              {/* Step Icon */}
              <div className="flex-shrink-0">
                {isCompleted && (
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {isError && (
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
                {isActive && (
                  <div className="w-6 h-6 rounded-full border-2 border-primary-500 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-primary-500 animate-pulse" />
                  </div>
                )}
                {!isActive && !isCompleted && !isError && (
                  <div className="w-6 h-6 rounded-full border-2 border-secondary-300 bg-white" />
                )}
              </div>

              {/* Step Label */}
              <div className="flex-1">
                <p className={cn(
                  'text-sm font-medium transition-colors',
                  isActive && 'text-primary-700',
                  isCompleted && 'text-green-700',
                  isError && 'text-red-700',
                  !isActive && !isCompleted && !isError && 'text-secondary-400'
                )}>
                  {step.label}
                </p>
                {isActive && step.estimatedDuration && (
                  <p className="text-xs text-secondary-500 mt-0.5">
                    משך משוער: {formatTime(step.estimatedDuration)}
                  </p>
                )}
              </div>

              {/* Loading Spinner for Active Step */}
              {isActive && (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-500 border-t-transparent" />
              )}
            </div>
          );
        })}
      </div>

      {/* Overall Progress */}
      {showEstimatedTime && (
        <div className="pt-3 border-t border-secondary-200">
          <div className="flex items-center justify-between text-xs text-secondary-600">
            <span>התקדמות כללית</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          {remainingTime > 0 && (
            <p className="text-xs text-secondary-500 mt-1 text-center">
              זמן משוער נותר: {formatTime(remainingTime)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Shimmer animation for progress bar
const shimmerStyles = `
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = shimmerStyles;
  document.head.appendChild(styleSheet);
}

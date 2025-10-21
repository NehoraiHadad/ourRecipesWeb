import { useState, useCallback } from 'react';
import type { ProgressStep } from '@/components/ui/ProgressIndicator';

export interface UseProgressOptions {
  steps: Omit<ProgressStep, 'status'>[];
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useProgress({ steps: initialSteps, onComplete, onError }: UseProgressOptions) {
  const [steps, setSteps] = useState<ProgressStep[]>(
    initialSteps.map(step => ({ ...step, status: 'pending' as const }))
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);

  const startStep = useCallback((index: number) => {
    setSteps(prev =>
      prev.map((step, i) =>
        i === index ? { ...step, status: 'in_progress' as const } : step
      )
    );
    setCurrentStepIndex(index);
  }, []);

  const completeStep = useCallback((index: number) => {
    setSteps(prev =>
      prev.map((step, i) =>
        i === index ? { ...step, status: 'completed' as const } : step
      )
    );

    // Check if this was the last step
    if (index === steps.length - 1) {
      setIsComplete(true);
      onComplete?.();
    } else {
      // Auto-start next step
      startStep(index + 1);
    }
  }, [steps.length, onComplete, startStep]);

  const errorStep = useCallback((index: number, error: Error) => {
    setSteps(prev =>
      prev.map((step, i) =>
        i === index ? { ...step, status: 'error' as const } : step
      )
    );
    setHasError(true);
    onError?.(error);
  }, [onError]);

  const reset = useCallback(() => {
    setSteps(initialSteps.map(step => ({ ...step, status: 'pending' as const })));
    setCurrentStepIndex(0);
    setIsComplete(false);
    setHasError(false);
  }, [initialSteps]);

  const start = useCallback(() => {
    reset();
    startStep(0);
  }, [reset, startStep]);

  return {
    steps,
    currentStepIndex,
    isComplete,
    hasError,
    startStep,
    completeStep,
    errorStep,
    reset,
    start,
  };
}

// Predefined step configurations for common operations
export const AI_IMAGE_GENERATION_STEPS: Omit<ProgressStep, 'status'>[] = [
  {
    id: 'analyze',
    label: 'מנתח את תוכן המתכון',
    estimatedDuration: 2
  },
  {
    id: 'generate',
    label: 'יוצר תמונה מדהימה',
    estimatedDuration: 12
  },
  {
    id: 'optimize',
    label: 'מעבד ומייעל את התמונה',
    estimatedDuration: 3
  }
];

export const AI_RECIPE_GENERATION_STEPS: Omit<ProgressStep, 'status'>[] = [
  {
    id: 'analyze-ingredients',
    label: 'מנתח את המצרכים והדרישות',
    estimatedDuration: 2
  },
  {
    id: 'generate-recipe',
    label: 'יוצר מתכון מותאם אישית',
    estimatedDuration: 8
  },
  {
    id: 'format',
    label: 'מעצב ומארגן את המתכון',
    estimatedDuration: 2
  }
];

export const RECIPE_SYNC_STEPS: Omit<ProgressStep, 'status'>[] = [
  {
    id: 'connect',
    label: 'מתחבר לטלגרם',
    estimatedDuration: 2
  },
  {
    id: 'fetch',
    label: 'מושך מתכונים חדשים',
    estimatedDuration: 5
  },
  {
    id: 'parse',
    label: 'מעבד ומנתח מתכונים',
    estimatedDuration: 4
  },
  {
    id: 'save',
    label: 'שומר במסד הנתונים',
    estimatedDuration: 2
  }
];

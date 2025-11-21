'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RecipeService } from '@/services/recipeService';
import { useNotification } from '@/context/NotificationContext';
import RecipeDisplay from '@/components/RecipeDisplay';
import Modal from '@/components/Modal';
import Spinner from '@/components/ui/Spinner';
import type { recipe } from '@/types';

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addNotification } = useNotification();

  const recipeId = parseInt(params.id as string);

  const [recipe, setRecipe] = useState<recipe | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>('טוען מתכון...');
  const [retryAttempt, setRetryAttempt] = useState<number>(0);

  useEffect(() => {
    if (recipeId) {
      loadRecipe();
    }
  }, [recipeId]);

  const loadRecipe = async () => {
    setLoading(true);
    setError('');
    setLoadingMessage('טוען מתכון...');
    setRetryAttempt(0);

    // Show server wake-up message after 3 seconds
    const wakeUpTimer = setTimeout(() => {
      setLoadingMessage('מעיר את השרת... זה עשוי לקחת כדקה ⏳');
    }, 3000);

    try {
      const response = await RecipeService.getRecipeByIdWithRetry(
        recipeId,
        (attempt, maxAttempts) => {
          setRetryAttempt(attempt);
          setLoadingMessage(
            `השרת עדיין מתעורר... מנסה שוב (ניסיון ${attempt} מתוך ${maxAttempts}) ⏳`
          );
        }
      );

      clearTimeout(wakeUpTimer);

      if (response && response.data) {
        setRecipe(response.data);
      } else {
        setError('מתכון לא נמצא');
      }
    } catch (err: any) {
      clearTimeout(wakeUpTimer);
      console.error('Error loading recipe:', err);

      // Provide helpful error messages based on error type
      let errorMessage = 'שגיאה בטעינת המתכון';
      if (err.name === 'TimeoutError' || err.status === 408) {
        errorMessage = 'הזמן הקצוב להעירת השרת חלף. אנא נסה שוב בעוד דקה.';
      } else if (err.status === 404) {
        errorMessage = 'מתכון לא נמצא';
      } else if (err.status === 502 || err.status === 504) {
        errorMessage = 'השרת עדיין מתעורר. אנא נסה שוב בעוד כמה שניות.';
      } else if (err.name === 'NetworkError' || err.status === 503) {
        errorMessage = 'בעיית תקשורת עם השרת. אנא בדוק את החיבור לאינטרנט ונסה שוב.';
      }

      console.error('💥 שגיאה סופית בטעינת מתכון:', {
        errorName: err?.name,
        errorStatus: err?.status,
        errorMessage: err?.message,
        chosenMessage: errorMessage
      });

      setError(errorMessage);
      addNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      router.back();
    }, 300); // Wait for modal close animation
  };

  if (loading) {
    return (
      <Modal isOpen={true} onClose={handleClose} size="md" showCloseButton={false}>
        <div className="flex flex-col items-center justify-center py-8 px-4">
          <Spinner />
          <p className="mt-4 text-center text-secondary-700 text-sm">
            {loadingMessage}
          </p>
          {retryAttempt > 0 && (
            <p className="mt-2 text-center text-secondary-500 text-xs">
              השרת עובד על שרת חינמי ולכן נרדם לעיתים. נא להמתין...
            </p>
          )}
        </div>
      </Modal>
    );
  }

  if (error || !recipe) {
    return (
      <Modal
        isOpen={true}
        onClose={handleClose}
        size="md"
        title="שגיאה"
      >
        <div className="text-center py-4">
          <div className="text-6xl mb-4">😕</div>
          <p className="text-lg text-secondary-700">
            {error || 'מתכון לא נמצא'}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      title={recipe.title}
      contentClassName="!p-0"
    >
      <RecipeDisplay recipe={recipe} />
    </Modal>
  );
}

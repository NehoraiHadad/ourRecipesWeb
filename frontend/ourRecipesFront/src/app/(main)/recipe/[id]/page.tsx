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

  useEffect(() => {
    if (recipeId) {
      loadRecipe();
    }
  }, [recipeId]);

  const loadRecipe = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await RecipeService.getRecipeById(recipeId);

      if (response && response.data) {
        setRecipe(response.data);
      } else {
        console.error('❌ תשובה ריקה מהשרת:', response);
        setError('מתכון לא נמצא');
      }
    } catch (err: any) {
      console.error('Error loading recipe:', err);

      let errorMessage = 'שגיאה בטעינת המתכון';
      if (err.status === 404) {
        errorMessage = 'מתכון לא נמצא';
      } else if (err.name === 'TimeoutError' || err.status === 408) {
        errorMessage = 'הבקשה ארכה זמן רב מדי. אנא נסה שוב.';
      } else if (err.name === 'NetworkError' || err.status === 503) {
        errorMessage = 'בעיית תקשורת עם השרת. אנא בדוק את החיבור לאינטרנט ונסה שוב.';
      }

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
            טוען מתכון...
          </p>
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

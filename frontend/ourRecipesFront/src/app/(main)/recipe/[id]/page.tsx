'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RecipeService } from '@/services/recipeService';
import { useNotification } from '@/context/NotificationContext';
import RecipeDetails from '@/components/recipe/RecipeDetails';
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
  const [showModal, setShowModal] = useState<boolean>(true);

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
        setError('מתכון לא נמצא');
      }
    } catch (err: any) {
      console.error('Error loading recipe:', err);
      setError(err.message || 'שגיאה בטעינת המתכון');
      addNotification({ message: 'שגיאה בטעינת המתכון', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    // חזרה לדף הראשי או לעמוד הקודם
    router.back();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
        <div className="bg-white rounded-lg p-8">
          <Spinner />
        </div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-secondary-800 mb-2">
            {error || 'מתכון לא נמצא'}
          </h2>
          <button
            onClick={handleClose}
            className="text-primary-500 hover:text-primary-700 mt-4 px-6 py-2 rounded-lg border border-primary-500 hover:bg-primary-50 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    );
  }

  if (!showModal) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header עם כפתור סגירה */}
        <div className="flex justify-between items-center p-4 border-b border-secondary-200">
          <h2 className="text-xl font-bold text-secondary-800">{recipe.title}</h2>
          <button
            onClick={handleClose}
            className="text-secondary-600 hover:text-secondary-800 p-2 rounded-lg hover:bg-secondary-100 transition-colors"
            aria-label="סגור"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* תוכן המתכון */}
        <div className="overflow-y-auto flex-1">
          <RecipeDetails
            recipe={recipe}
            onRecipeUpdated={(updatedRecipe) => setRecipe(updatedRecipe)}
          />
        </div>
      </div>
    </div>
  );
}

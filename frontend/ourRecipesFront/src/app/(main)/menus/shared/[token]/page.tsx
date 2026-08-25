'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { RecipeService } from '@/services/recipeService';
import { useNotification } from '@/context/NotificationContext';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/Modal';
import RecipeDetails from '@/components/recipe/RecipeDetails';
import type { Menu } from '@/types';
import type { recipe } from '@/types';

export default function SharedMenuPage() {
  const params = useParams();
  const { addNotification } = useNotification();

  const shareToken = params.token as string;

  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [viewingRecipe, setViewingRecipe] = useState<recipe | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('טוען תפריט...');

  useEffect(() => {
    if (shareToken) {
      loadSharedMenu();
    }
  }, [shareToken]);

  const loadSharedMenu = async () => {
    setLoading(true);
    setError('');
    setLoadingMessage('טוען תפריט...');

    // Show server wake-up message after 3 seconds
    const wakeUpTimer = setTimeout(() => {
      setLoadingMessage('מעיר את השרת... זה עשוי לקחת עד דקה וחצי ⏳');
    }, 3000);

    try {
      const response = await menuService.getSharedMenu(shareToken);

      clearTimeout(wakeUpTimer);

      if (response.menu) {
        setMenu(response.menu);
      } else {
        setError('תפריט לא נמצא או לא שותף');
      }
    } catch (err: any) {
      clearTimeout(wakeUpTimer);
      console.error('Error loading shared menu:', err);

      let errorMessage = 'שגיאה בטעינת התפריט';
      if (err.name === 'TimeoutError' || err.status === 408) {
        errorMessage = 'השרת לוקח זמן להתעורר. אנא רענן את הדף או חזור לקישור בעוד 30 שניות.';
      } else if (err.status === 502 || err.status === 504) {
        errorMessage = 'השרת מתעורר כעת. אנא רענן את הדף או נסה שוב בעוד כמה שניות.';
      } else if (err.name === 'NetworkError' || err.status === 503) {
        errorMessage = 'בעיית תקשורת עם השרת. אנא בדוק את החיבור לאינטרנט ונסה שוב.';
      }

      console.error('💥 שגיאה בטעינת תפריט משותף:', {
        errorName: err?.name,
        errorStatus: err?.status,
        errorMessage: err?.message,
        chosenMessage: errorMessage
      });

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getDietaryLabel = (type?: string) => {
    const labels = {
      meat: 'בשרי',
      dairy: 'חלבי',
      pareve: 'פרווה',
    };
    return type ? labels[type as keyof typeof labels] || type : 'כללי';
  };

  const handleRecipeClick = async (recipeId: number) => {
    setLoadingRecipe(true);

    try {
      const response = await RecipeService.getRecipeById(recipeId);
      setViewingRecipe(response.data);
    } catch (error: any) {
      console.error('Error loading recipe:', error);

      let errorMessage = 'שגיאה בטעינת המתכון';
      if (error.status === 404) {
        errorMessage = 'מתכון לא נמצא';
      } else if (error.name === 'TimeoutError' || error.status === 408) {
        errorMessage = 'הבקשה ארכה זמן רב מדי. אנא נסה שוב.';
      } else if (error.name === 'NetworkError' || error.status === 503) {
        errorMessage = 'בעיית תקשורת עם השרת. אנא בדוק את החיבור לאינטרנט ונסה שוב.';
      }

      addNotification({ message: errorMessage, type: 'error' });
    } finally {
      setLoadingRecipe(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen gap-4">
        <Spinner />
        <p className="text-center text-secondary-700 text-sm">
          {loadingMessage}
        </p>
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen p-6">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          {error || 'תפריט לא נמצא'}
        </h2>
        <p className="text-gray-600">
          התפריט אינו זמין או שהקישור אינו תקף
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-52px)] overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Shared indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-blue-700">
          🔗 זהו תפריט משותף - אתה מוזמן לצפות ולהשתמש בו!
        </p>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          {menu.name}
        </h1>
        {menu.description && (
          <p className="text-gray-600 mb-4">
            {menu.description}
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          {menu.event_type && (
            <div>
              <span className="font-semibold">סוג אירוע:</span> {menu.event_type}
            </div>
          )}
          <div>
            <span className="font-semibold">סועדים:</span> {menu.total_servings}
          </div>
          {menu.dietary_type && (
            <div>
              <span className="font-semibold">כשרות:</span>{' '}
              {getDietaryLabel(menu.dietary_type)}
            </div>
          )}
          <div>
            <span className="font-semibold">נוצר:</span> {formatDate(menu.created_at)}
          </div>
        </div>

        {menu.ai_reasoning && (
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-700">
              <span className="font-semibold">💡 למה בחרנו ככה?</span>{' '}
              {menu.ai_reasoning}
            </p>
          </div>
        )}
      </div>

      {/* Meals */}
      {menu.meals && menu.meals.length > 0 ? (
        <div className="space-y-6">
          {menu.meals.map((meal) => (
            <div
              key={meal.id}
              className="bg-white rounded-lg shadow-md p-6"
            >
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                {meal.meal_type}
                {meal.meal_time && (
                  <span className="text-sm text-gray-500 mr-2">
                    ({meal.meal_time})
                  </span>
                )}
              </h2>

              {meal.notes && (
                <p className="text-gray-600 mb-4">
                  {meal.notes}
                </p>
              )}

              <div className="space-y-4">
                {meal.recipes && meal.recipes.length > 0 ? (
                  meal.recipes.map((mealRecipe) => (
                    <div
                      key={mealRecipe.id}
                      onClick={() => handleRecipeClick(mealRecipe.recipe_id)}
                      className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      {mealRecipe.recipe?.image_url && (
                        <img
                          src={mealRecipe.recipe.image_url}
                          alt={mealRecipe.recipe?.title}
                          className="w-20 h-20 object-cover rounded-md"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800">
                          {mealRecipe.recipe?.title || 'מתכון'}
                        </h3>
                        {mealRecipe.course_type && (
                          <p className="text-sm text-gray-500">
                            {mealRecipe.course_type}
                          </p>
                        )}
                        {mealRecipe.ai_reason && (
                          <p className="text-sm text-gray-600 mt-1">
                            {mealRecipe.ai_reason}
                          </p>
                        )}
                        <div className="flex gap-3 mt-2 text-xs text-gray-500">
                          {mealRecipe.recipe?.cooking_time && (
                            <span>⏱️ {mealRecipe.recipe.cooking_time} דק׳</span>
                          )}
                          {mealRecipe.recipe?.difficulty && (
                            <span>📊 {mealRecipe.recipe.difficulty}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">
                    אין מתכונים בארוחה זו
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-gray-500 text-center">
            אין ארוחות בתפריט זה
          </p>
        </div>
      )}
      </div>

      {/* Recipe View Modal */}
      <Modal
        isOpen={!!viewingRecipe || loadingRecipe}
        onClose={() => {
          setViewingRecipe(null);
        }}
        title={viewingRecipe?.title}
      >
        {loadingRecipe && (
          <div className="flex flex-col justify-center items-center p-8 gap-4">
            <Spinner />
            <p className="text-center text-secondary-700 text-sm">
              טוען מתכון...
            </p>
          </div>
        )}

        {viewingRecipe && !loadingRecipe && (
          <RecipeDetails
            recipe={viewingRecipe}
            isEditing={false}
            onEditStart={() => {}}
            onEditEnd={() => {}}
          />
        )}
      </Modal>
    </div>
  );
}

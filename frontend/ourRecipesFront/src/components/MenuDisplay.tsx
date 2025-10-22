import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { useNotification } from '@/context/NotificationContext';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { Menu, RecipeSummary } from '@/types';

interface MenuDisplayProps {
  menu: Menu;
  onMenuUpdated?: (menu: Menu) => void;
  onMenuDeleted?: () => void;
}

const MenuDisplay: React.FC<MenuDisplayProps> = ({
  menu: initialMenu,
  onMenuUpdated,
  onMenuDeleted,
}) => {
  const router = useRouter();
  const { addNotification } = useNotification();

  const [menu, setMenu] = useState<Menu>(initialMenu);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedRecipe, setSelectedRecipe] = useState<{
    mealId: number;
    recipeId: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<RecipeSummary[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);

  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(menu.is_public);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get dietary type label
  const getDietaryLabel = (type?: string) => {
    const labels = {
      meat: 'בשרי',
      dairy: 'חלבי',
      pareve: 'פרווה',
    };
    return type ? labels[type as keyof typeof labels] || type : 'כללי';
  };

  // Handle recipe click to get suggestions
  const handleRecipeClick = async (mealId: number, recipeId: number) => {
    setSelectedRecipe({ mealId, recipeId });
    setLoadingSuggestions(true);

    try {
      const response = await menuService.getRecipeSuggestions(
        menu.id,
        mealId,
        recipeId
      );

      if (response.suggestions) {
        setSuggestions(response.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
      addNotification({ message: 'שגיאה בטעינת הצעות', type: 'error' });
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Handle recipe replacement
  const handleReplaceRecipe = async (newRecipeId: number) => {
    if (!selectedRecipe) return;

    setLoading(true);

    try {
      const response = await menuService.replaceRecipe(
        menu.id,
        selectedRecipe.mealId,
        selectedRecipe.recipeId,
        newRecipeId
      );

      // Refresh menu
      const menuResponse = await menuService.getMenu(menu.id);
      if (menuResponse.menu) {
        setMenu(menuResponse.menu);
        if (onMenuUpdated) {
          onMenuUpdated(menuResponse.menu);
        }
      }

      addNotification({ message: 'המתכון הוחלף בהצלחה!', type: 'success' });
      setSelectedRecipe(null);
      setSuggestions([]);
    } catch (error) {
      console.error('Error replacing recipe:', error);
      addNotification({ message: 'שגיאה בהחלפת המתכון', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle share toggle
  const handleShareToggle = async () => {
    setLoading(true);

    try {
      const response = await menuService.updateMenu(menu.id, {
        is_public: !isPublic,
      });

      if (response.menu) {
        setIsPublic(response.menu.is_public);
        setMenu(response.menu);
        addNotification(
          response.menu.is_public ? 'התפריט שותף בהצלחה!' : 'השיתוף בוטל',
          'success'
        );
      }
    } catch (error) {
      console.error('Error toggling share:', error);
      addNotification({ message: 'שגיאה בשיתוף התפריט', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Copy share link
  const handleCopyShareLink = async () => {
    const success = await menuService.copyShareLink(menu.share_token);

    if (success) {
      addNotification({ message: 'הקישור הועתק ללוח!', type: 'success' });
    } else {
      addNotification({ message: 'שגיאה בהעתקת הקישור', type: 'error' });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התפריט?')) {
      return;
    }

    setLoading(true);

    try {
      await menuService.deleteMenu(menu.id);
      addNotification({ message: 'התפריט נמחק בהצלחה', type: 'success' });

      if (onMenuDeleted) {
        onMenuDeleted();
      } else {
        router.push('/menus');
      }
    } catch (error) {
      console.error('Error deleting menu:', error);
      addNotification({ message: 'שגיאה במחיקת התפריט', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
              {menu.name}
            </h1>
            {menu.description && (
              <p className="text-gray-600 dark:text-gray-400">
                {menu.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/menus')}
            >
              חזרה לתפריטים
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
          {menu.event_type && (
            <div className="flex items-center gap-1">
              <span className="font-semibold">סוג אירוע:</span>
              <span>{menu.event_type}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="font-semibold">סועדים:</span>
            <span>{menu.total_servings}</span>
          </div>
          {menu.dietary_type && (
            <div className="flex items-center gap-1">
              <span className="font-semibold">כשרות:</span>
              <span>{getDietaryLabel(menu.dietary_type)}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="font-semibold">נוצר:</span>
            <span>{formatDate(menu.created_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/menus/${menu.id}/shopping-list`)}
          >
            📝 רשימת קניות
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareToggle}
            disabled={loading}
          >
            {isPublic ? '🔓 שותף' : '🔒 פרטי'}
          </Button>
          {isPublic && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyShareLink}
            >
              📋 העתק קישור
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={loading}
            className="text-red-600 hover:bg-red-50 dark:text-red-400"
          >
            🗑️ מחק
          </Button>
        </div>

        {/* AI Reasoning */}
        {menu.ai_reasoning && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <span className="font-semibold">🤖 הסבר ה-AI:</span> {menu.ai_reasoning}
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
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6"
            >
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                {meal.meal_type}
                {meal.meal_time && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">
                    ({meal.meal_time})
                  </span>
                )}
              </h2>

              {meal.notes && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {meal.notes}
                </p>
              )}

              <div className="space-y-4">
                {meal.recipes && meal.recipes.length > 0 ? (
                  meal.recipes.map((mealRecipe) => (
                    <div
                      key={mealRecipe.id}
                      className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg
                               hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors
                               cursor-pointer"
                      onClick={() => handleRecipeClick(meal.id, mealRecipe.recipe_id)}
                    >
                      {mealRecipe.recipe?.image_url && (
                        <img
                          src={mealRecipe.recipe.image_url}
                          alt={mealRecipe.recipe?.title}
                          className="w-20 h-20 object-cover rounded-md"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                          {mealRecipe.recipe?.title || 'מתכון לא זמין'}
                        </h3>
                        {mealRecipe.course_type && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {mealRecipe.course_type}
                          </p>
                        )}
                        {mealRecipe.ai_reason && (
                          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            {mealRecipe.ai_reason}
                          </p>
                        )}
                        <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {mealRecipe.recipe?.cooking_time && (
                            <span>⏱️ {mealRecipe.recipe.cooking_time} דק׳</span>
                          )}
                          {mealRecipe.recipe?.difficulty && (
                            <span>📊 {mealRecipe.recipe.difficulty}</span>
                          )}
                        </div>
                      </div>
                      <button
                        className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecipeClick(meal.id, mealRecipe.recipe_id);
                        }}
                      >
                        החלף →
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    אין מתכונים בארוחה זו
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <p className="text-gray-500 dark:text-gray-400 text-center">
            אין ארוחות בתפריט זה
          </p>
        </div>
      )}

      {/* Recipe replacement modal */}
      {selectedRecipe && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setSelectedRecipe(null);
            setSuggestions([]);
          }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                בחר מתכון חלופי
              </h3>
              <button
                onClick={() => {
                  setSelectedRecipe(null);
                  setSuggestions([]);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {loadingSuggestions ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg
                             hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors
                             cursor-pointer"
                    onClick={() => handleReplaceRecipe(suggestion.id)}
                  >
                    {suggestion.image_url && (
                      <img
                        src={suggestion.image_url}
                        alt={suggestion.title}
                        className="w-16 h-16 object-cover rounded-md"
                      />
                    )}
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 dark:text-white">
                        {suggestion.title}
                      </h4>
                      {suggestion.categories && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {suggestion.categories}
                        </p>
                      )}
                      <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {suggestion.cooking_time && (
                          <span>⏱️ {suggestion.cooking_time} דק׳</span>
                        )}
                        {suggestion.difficulty && (
                          <span>📊 {suggestion.difficulty}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                לא נמצאו הצעות חלופיות
              </p>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
            <Spinner />
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuDisplay;

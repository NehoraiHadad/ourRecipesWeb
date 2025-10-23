import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { menuService } from '@/services/menuService';
import { useNotification } from '@/context/NotificationContext';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/Modal';
import RecipeDetails from '@/components/recipe/RecipeDetails';
import { RecipeService } from '@/services/recipeService';
import { SearchService } from '@/services/searchService';
import { useDebounce } from '@/hooks/useDebounce';
import type { Menu, RecipeSummary, recipe } from '@/types';

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

  // For viewing a recipe
  const [viewingRecipe, setViewingRecipe] = useState<recipe | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState<boolean>(false);

  // For replacing a recipe
  const [selectedRecipe, setSelectedRecipe] = useState<{
    mealId: number;
    recipeId: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<RecipeSummary[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);

  // For search in replacement modal
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<recipe[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(menu.is_public);

  // For adding recipe to meal
  const [addingToMeal, setAddingToMeal] = useState<number | null>(null);
  const [addRecipeSearchQuery, setAddRecipeSearchQuery] = useState<string>('');
  const [addRecipeSearchResults, setAddRecipeSearchResults] = useState<recipe[]>([]);
  const [isAddRecipeSearching, setIsAddRecipeSearching] = useState<boolean>(false);

  // For adding new meal
  const [showAddMealModal, setShowAddMealModal] = useState<boolean>(false);
  const [newMealType, setNewMealType] = useState<string>('ארוחת ערב');
  const [newMealTime, setNewMealTime] = useState<string>('');

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

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

  // Handle recipe click to VIEW the recipe
  const handleRecipeClick = async (recipeId: number) => {
    setLoadingRecipe(true);

    try {
      const response = await RecipeService.getRecipeById(recipeId);
      setViewingRecipe(response.data);
    } catch (error) {
      console.error('Error loading recipe:', error);
      addNotification({ message: 'שגיאה בטעינת המתכון', type: 'error' });
    } finally {
      setLoadingRecipe(false);
    }
  };

  // Handle replace button click to get suggestions
  const handleReplaceClick = async (mealId: number, recipeId: number) => {
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
        addNotification({
          message: response.menu.is_public ? 'התפריט שותף בהצלחה!' : 'השיתוף בוטל',
          type: 'success'
        });
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

  // Handle search suggestions
  const handleSearchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchSuggestions([]);
      return;
    }

    try {
      const suggestionsResponse = await SearchService.getSearchSuggestions(query);
      const suggestionsData = Array.isArray(suggestionsResponse)
        ? suggestionsResponse
        : (suggestionsResponse?.data || []);

      setSearchSuggestions(Array.isArray(suggestionsData) ? suggestionsData : []);
    } catch (error) {
      console.error('Search suggestions failed:', error);
      setSearchSuggestions([]);
    }
  }, []);

  // Perform recipe search
  const performRecipeSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setShowSearchSuggestions(false);

    try {
      const response = await SearchService.search({ query });

      if (response?.results) {
        // Convert search results to recipe array
        const recipes = Object.values(response.results);
        setSearchResults(recipes);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Recipe search failed:', error);
      setSearchResults([]);
      addNotification({ message: 'שגיאה בחיפוש מתכונים', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  // Effect for debounced search suggestions
  useEffect(() => {
    handleSearchSuggestions(debouncedSearchQuery);
  }, [debouncedSearchQuery, handleSearchSuggestions]);

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

  // Handle delete recipe from meal
  const handleDeleteRecipe = async (mealId: number, recipeId: number) => {
    if (!confirm('האם אתה בטוח שברצונך להסיר מתכון זה מהארוחה?')) {
      return;
    }

    setLoading(true);

    try {
      await menuService.deleteRecipeFromMeal(menu.id, mealId, recipeId);

      // Refresh menu
      const menuResponse = await menuService.getMenu(menu.id);
      if (menuResponse.menu) {
        setMenu(menuResponse.menu);
        if (onMenuUpdated) {
          onMenuUpdated(menuResponse.menu);
        }
      }

      addNotification({ message: 'המתכון הוסר בהצלחה!', type: 'success' });
    } catch (error) {
      console.error('Error deleting recipe:', error);
      addNotification({ message: 'שגיאה בהסרת המתכון', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle delete meal
  const handleDeleteMeal = async (mealId: number) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק ארוחה זו?')) {
      return;
    }

    setLoading(true);

    try {
      await menuService.deleteMeal(menu.id, mealId);

      // Refresh menu
      const menuResponse = await menuService.getMenu(menu.id);
      if (menuResponse.menu) {
        setMenu(menuResponse.menu);
        if (onMenuUpdated) {
          onMenuUpdated(menuResponse.menu);
        }
      }

      addNotification({ message: 'הארוחה נמחקה בהצלחה!', type: 'success' });
    } catch (error) {
      console.error('Error deleting meal:', error);
      addNotification({ message: 'שגיאה במחיקת הארוחה', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle add recipe to meal - search
  const performAddRecipeSearch = async (query: string) => {
    if (!query.trim()) {
      setAddRecipeSearchResults([]);
      return;
    }

    setIsAddRecipeSearching(true);

    try {
      const response = await SearchService.search({ query });

      if (response?.results) {
        const recipes = Object.values(response.results);
        setAddRecipeSearchResults(recipes);
      } else {
        setAddRecipeSearchResults([]);
      }
    } catch (error) {
      console.error('Recipe search failed:', error);
      setAddRecipeSearchResults([]);
      addNotification({ message: 'שגיאה בחיפוש מתכונים', type: 'error' });
    } finally {
      setIsAddRecipeSearching(false);
    }
  };

  // Handle add recipe to meal
  const handleAddRecipeToMeal = async (mealId: number, recipeId: number) => {
    setLoading(true);

    try {
      await menuService.addRecipeToMeal(menu.id, mealId, recipeId);

      // Refresh menu
      const menuResponse = await menuService.getMenu(menu.id);
      if (menuResponse.menu) {
        setMenu(menuResponse.menu);
        if (onMenuUpdated) {
          onMenuUpdated(menuResponse.menu);
        }
      }

      addNotification({ message: 'המתכון נוסף בהצלחה!', type: 'success' });
      setAddingToMeal(null);
      setAddRecipeSearchQuery('');
      setAddRecipeSearchResults([]);
    } catch (error) {
      console.error('Error adding recipe:', error);
      addNotification({ message: 'שגיאה בהוספת המתכון', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle add new meal
  const handleAddMeal = async () => {
    if (!newMealType.trim()) {
      addNotification({ message: 'נא לבחור סוג ארוחה', type: 'error' });
      return;
    }

    setLoading(true);

    try {
      await menuService.addMealToMenu(menu.id, newMealType, newMealTime || undefined);

      // Refresh menu
      const menuResponse = await menuService.getMenu(menu.id);
      if (menuResponse.menu) {
        setMenu(menuResponse.menu);
        if (onMenuUpdated) {
          onMenuUpdated(menuResponse.menu);
        }
      }

      addNotification({ message: 'הארוחה נוספה בהצלחה!', type: 'success' });
      setShowAddMealModal(false);
      setNewMealType('ארוחת ערב');
      setNewMealTime('');
    } catch (error) {
      console.error('Error adding meal:', error);
      addNotification({ message: 'שגיאה בהוספת הארוחה', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-52px)] overflow-y-auto bg-secondary-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-warm p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-secondary-800 mb-2">
              {menu.name}
            </h1>
            {menu.description && (
              <p className="text-secondary-600">
                {menu.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/menus')}
            >
              חזרה לתפריטים
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-secondary-600">
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
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/menus/${menu.id}/shopping-list`)}
          >
            📝 רשימת קניות
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddMealModal(true)}
            disabled={loading}
          >
            ➕ הוסף ארוחה
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleShareToggle}
            disabled={loading}
          >
            {isPublic ? '🔓 שותף' : '🔒 פרטי'}
          </Button>
          {isPublic && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyShareLink}
            >
              📋 העתק קישור
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDelete}
            disabled={loading}
            className="text-red-600 hover:bg-red-50"
          >
            🗑️ מחק
          </Button>
        </div>

        {/* AI Reasoning */}
        {menu.ai_reasoning && (
          <div className="mt-4 p-3 bg-primary-50 rounded-md">
            <p className="text-sm text-primary-700">
              <span className="font-semibold">💡 למה בחרנו ככה?</span> {menu.ai_reasoning}
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
              className="bg-white rounded-lg shadow-warm p-6"
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-secondary-800">
                  {meal.meal_type}
                  {meal.meal_time && (
                    <span className="text-sm text-secondary-500 mr-2">
                      ({meal.meal_time})
                    </span>
                  )}
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAddingToMeal(meal.id)}
                    disabled={loading}
                  >
                    ➕ הוסף מתכון
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeleteMeal(meal.id)}
                    disabled={loading}
                    className="text-red-600 hover:bg-red-50"
                  >
                    🗑️ מחק ארוחה
                  </Button>
                </div>
              </div>

              {meal.notes && (
                <p className="text-secondary-600 mb-4">
                  {meal.notes}
                </p>
              )}

              <div className="space-y-4">
                {meal.recipes && meal.recipes.length > 0 ? (
                  meal.recipes.map((mealRecipe) => (
                    <div
                      key={mealRecipe.id}
                      className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg
                               hover:bg-secondary-100 transition-colors
                               cursor-pointer"
                      onClick={() => handleRecipeClick(mealRecipe.recipe_id)}
                    >
                      {mealRecipe.recipe?.image_url && (
                        <img
                          src={mealRecipe.recipe.image_url}
                          alt={mealRecipe.recipe?.title}
                          className="w-20 h-20 object-cover rounded-md"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-secondary-800 hover:text-primary-600 transition-colors">
                          {mealRecipe.recipe?.title || 'מתכון לא זמין'}
                        </h3>
                        {mealRecipe.course_type && (
                          <p className="text-sm text-secondary-500">
                            {mealRecipe.course_type}
                          </p>
                        )}
                        {mealRecipe.ai_reason && (
                          <p className="text-sm text-secondary-600 mt-1">
                            💡 {mealRecipe.ai_reason}
                          </p>
                        )}
                        <div className="flex gap-3 mt-2 text-xs text-secondary-500">
                          {mealRecipe.recipe?.cooking_time && (
                            <span>⏱️ {mealRecipe.recipe.cooking_time} דק׳</span>
                          )}
                          {mealRecipe.recipe?.difficulty && (
                            <span>📊 {mealRecipe.recipe.difficulty}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReplaceClick(meal.id, mealRecipe.recipe_id);
                          }}
                        >
                          🔄 החלף
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRecipe(meal.id, mealRecipe.recipe_id);
                          }}
                          className="text-red-600 hover:bg-red-50"
                        >
                          ✕ הסר
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-secondary-500">
                    אין מתכונים בארוחה זו
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-warm p-6">
          <p className="text-secondary-500 text-center">
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
            setSearchQuery('');
            setSearchResults([]);
            setSearchSuggestions([]);
          }}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-secondary-800">
                בחר מתכון חלופי
              </h3>
              <button
                onClick={() => {
                  setSelectedRecipe(null);
                  setSuggestions([]);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchSuggestions([]);
                }}
                className="text-secondary-500 hover:text-secondary-700"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4">
              <div className="relative">
                <input
                  type="search"
                  placeholder="חפש מתכון..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchSuggestions(true);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      performRecipeSearch(searchQuery);
                    }
                  }}
                  className="w-full px-4 py-2 border border-secondary-200 rounded-lg
                           bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100
                           outline-none transition-all duration-200"
                />

                {/* Search Button */}
                <button
                  type="button"
                  onClick={() => performRecipeSearch(searchQuery)}
                  disabled={isSearching || !searchQuery.trim()}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500 hover:text-primary-500 transition-colors disabled:opacity-50"
                >
                  {isSearching ? (
                    <Spinner size="sm" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </button>

                {/* Search Suggestions Dropdown */}
                {showSearchSuggestions && searchSuggestions.length > 0 && searchQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-secondary-100 max-h-60 overflow-y-auto z-50">
                    {searchSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setSearchQuery(suggestion);
                          performRecipeSearch(suggestion);
                        }}
                        className="w-full text-right px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-50 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-secondary-700 mb-2">
                  תוצאות חיפוש ({searchResults.length}):
                </h4>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {searchResults.map((recipe) => (
                    <div
                      key={recipe.id}
                      className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg
                               hover:bg-secondary-100 transition-colors cursor-pointer"
                      onClick={() => handleReplaceRecipe(recipe.id)}
                    >
                      {recipe.image && (
                        <img
                          src={recipe.image}
                          alt={recipe.title}
                          className="w-16 h-16 object-cover rounded-md"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold text-secondary-800">
                          {recipe.title}
                        </h4>
                        {recipe.categories && recipe.categories.length > 0 && (
                          <p className="text-sm text-secondary-500">
                            {recipe.categories.join(', ')}
                          </p>
                        )}
                        <div className="flex gap-3 mt-1 text-xs text-secondary-500">
                          {recipe.preparation_time && (
                            <span>⏱️ {recipe.preparation_time} דק׳</span>
                          )}
                          {recipe.difficulty && (
                            <span>📊 {recipe.difficulty}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Suggestions */}
            <div>
              <h4 className="text-sm font-semibold text-secondary-700 mb-2">
                {searchResults.length > 0 ? 'הצעות נוספות מה-AI:' : 'הצעות מה-AI:'}
              </h4>
              {loadingSuggestions ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg
                               hover:bg-secondary-100 transition-colors
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
                        <h4 className="font-semibold text-secondary-800">
                          {suggestion.title}
                        </h4>
                        {suggestion.categories && (
                          <p className="text-sm text-secondary-500">
                            {suggestion.categories}
                          </p>
                        )}
                        <div className="flex gap-3 mt-1 text-xs text-secondary-500">
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
                <p className="text-secondary-500 text-center py-8">
                  לא נמצאו הצעות חלופיות
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recipe View Modal */}
      <Modal
        isOpen={!!viewingRecipe || loadingRecipe}
        onClose={() => {
          setViewingRecipe(null);
        }}
        title={viewingRecipe?.title}
      >
        {loadingRecipe && (
          <div className="flex justify-center items-center p-8">
            <Spinner message="טוען מתכון..." />
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

      {/* Add Recipe to Meal Modal */}
      {addingToMeal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setAddingToMeal(null);
            setAddRecipeSearchQuery('');
            setAddRecipeSearchResults([]);
          }}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-secondary-800">
                הוסף מתכון לארוחה
              </h3>
              <button
                onClick={() => {
                  setAddingToMeal(null);
                  setAddRecipeSearchQuery('');
                  setAddRecipeSearchResults([]);
                }}
                className="text-secondary-500 hover:text-secondary-700"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4">
              <div className="relative">
                <input
                  type="search"
                  placeholder="חפש מתכון להוסיף..."
                  value={addRecipeSearchQuery}
                  onChange={(e) => setAddRecipeSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      performAddRecipeSearch(addRecipeSearchQuery);
                    }
                  }}
                  className="w-full px-4 py-2 border border-secondary-200 rounded-lg
                           bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100
                           outline-none transition-all duration-200"
                />

                <button
                  type="button"
                  onClick={() => performAddRecipeSearch(addRecipeSearchQuery)}
                  disabled={isAddRecipeSearching || !addRecipeSearchQuery.trim()}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500 hover:text-primary-500 transition-colors disabled:opacity-50"
                >
                  {isAddRecipeSearching ? (
                    <Spinner size="sm" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Search Results */}
            {addRecipeSearchResults.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-secondary-700 mb-2">
                  תוצאות חיפוש ({addRecipeSearchResults.length}):
                </h4>
                <div className="space-y-3">
                  {addRecipeSearchResults.map((recipe: any) => (
                    <div
                      key={recipe.id}
                      className="flex items-start gap-4 p-4 bg-secondary-50 rounded-lg
                               hover:bg-secondary-100 transition-colors cursor-pointer"
                      onClick={() => handleAddRecipeToMeal(addingToMeal, recipe.id)}
                    >
                      {recipe.image && (
                        <img
                          src={recipe.image}
                          alt={recipe.title}
                          className="w-16 h-16 object-cover rounded-md"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold text-secondary-800">
                          {recipe.title}
                        </h4>
                        {recipe.categories && recipe.categories.length > 0 && (
                          <p className="text-sm text-secondary-500">
                            {recipe.categories.join(', ')}
                          </p>
                        )}
                        <div className="flex gap-3 mt-1 text-xs text-secondary-500">
                          {recipe.preparation_time && (
                            <span>⏱️ {recipe.preparation_time} דק׳</span>
                          )}
                          {recipe.difficulty && (
                            <span>📊 {recipe.difficulty}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-secondary-500">
                <p>חפש מתכון כדי להוסיף</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Meal Modal */}
      {showAddMealModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddMealModal(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-secondary-800">
                הוסף ארוחה חדשה
              </h3>
              <button
                onClick={() => setShowAddMealModal(false)}
                className="text-secondary-500 hover:text-secondary-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-secondary-700">
                  סוג ארוחה *
                </label>
                <select
                  value={newMealType}
                  onChange={(e) => setNewMealType(e.target.value)}
                  className="w-full p-2 border border-secondary-200 rounded-lg
                           bg-white text-secondary-900
                           focus:ring-2 focus:ring-primary-100 transition-all"
                >
                  <option value="ארוחת ערב שבת">ארוחת ערב שבת</option>
                  <option value="ארוחת בוקר שבת">ארוחת בוקר שבת</option>
                  <option value="ארוחת צהריים שבת">ארוחת צהריים שבת</option>
                  <option value="סעודה שלישית">סעודה שלישית</option>
                  <option value="ארוחת בוקר">ארוחת בוקר</option>
                  <option value="ארוחת צהריים">ארוחת צהריים</option>
                  <option value="ארוחת ערב">ארוחת ערב</option>
                  <option value="קידוש">קידוש</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-secondary-700">
                  שעת הארוחה (אופציונלי)
                </label>
                <input
                  type="time"
                  value={newMealTime}
                  onChange={(e) => setNewMealTime(e.target.value)}
                  className="w-full p-2 border border-secondary-200 rounded-lg
                           bg-white text-secondary-900
                           focus:ring-2 focus:ring-primary-100 transition-all"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleAddMeal}
                  disabled={loading || !newMealType.trim()}
                  variant="primary"
                  className="flex-1"
                >
                  הוסף
                </Button>
                <Button
                  onClick={() => setShowAddMealModal(false)}
                  variant="secondary"
                  className="flex-1"
                >
                  ביטול
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <Spinner />
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default MenuDisplay;

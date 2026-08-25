import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { recipe } from '../types';
import { ViewMode, BulkAction } from '../types/management';
import RecipeToolbar from './RecipeToolbar';
import RecipeList from './management/RecipeList';
import RecipeGrid from './management/RecipeGrid';
import Spinner from '@/components/ui/Spinner';
import { useAuthContext } from '../context/AuthContext';
import TypingEffect from './TypingEffect';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RecipeCardSkeleton } from '@/components/ui/Skeleton';
import { apiService } from '@/services/apiService';
import { toUiRecipe, type RawRecipeRow } from '@/services/recipeMapper';

/** `GET /api/recipes/manage` is paginated; the management screen wants them all. */
const MANAGE_PAGE_SIZE = 100;

/** Bulk AI parsing runs per recipe — it needs a generous timeout. */
const BULK_TIMEOUT = 600000;

export default function RecipeManagement() {
  const [recipes, setRecipes] = useState<recipe[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMessage, setShowMessage] = useState({ status: false, message: "" });
  const [isProcessing, setIsProcessing] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc');
  const [filterBy, setFilterBy] = useState('all');
  
  const { authState } = useAuthContext();
  
  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);

      // `GET /api/recipes/manage` answers `{ data, pagination }` — walk the pages.
      const collected: RawRecipeRow[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await apiService.get<{
          data: RawRecipeRow[];
          pagination: { page: number; totalPages: number };
        }>(`/api/recipes/manage?page=${page}&pageSize=${MANAGE_PAGE_SIZE}`, { timeout: 30000 });

        collected.push(...(response?.data ?? []));
        totalPages = response?.pagination?.totalPages ?? 1;
        page += 1;
      } while (page <= totalPages);

      setRecipes(collected.map(toUiRecipe));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const handleBulkAction = async (action: BulkAction, data?: any) => {
    if (!selectedRecipes.length || !authState.canEdit) return;
    
    setIsProcessing(true);
    try {
      // `POST /api/recipes/bulk` answers flat `{ processed, failed, total }`.
      const result = await apiService.post<{
        processed: number;
        failed: number;
        total: number;
      }>('/api/recipes/bulk', {
        action,
        recipeIds: selectedRecipes,
        data
      }, { timeout: BULK_TIMEOUT });

      setShowMessage({
        status: true,
        message: `${action === 'parse' ? 'פרסור' : 'פעולה'} הושלמה בהצלחה: ${result.processed} מתכונים עודכנו`
      });
      
      await fetchRecipes();
      setSelectedRecipes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed');
      setShowMessage({
        status: true,
        message: `שגיאה בביצוע הפעולה: ${err instanceof Error ? err.message : 'אירעה שגיאה'}`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecipeUpdate = async (updatedRecipe: recipe) => {
    const recipeIndex = recipes.findIndex(r => r.id === updatedRecipe.id);
    if (recipeIndex === -1) return;

    setRecipes(prev => [
      ...prev.slice(0, recipeIndex),
      updatedRecipe,
      ...prev.slice(recipeIndex + 1)
    ]);
  };

  const handleViewModeChange = (mode: ViewMode) => {
      setViewMode(mode);
  };

  const handleMessageComplete = () => {
    setShowMessage({ status: false, message: "" });
  };

  const filteredAndSortedRecipes = useMemo(() => {
    let result = [...recipes];

    // Filter
    switch (filterBy) {
      case 'parsed':
        result = result.filter(recipe => recipe.is_parsed);
        break;
      case 'not_parsed':
        result = result.filter(recipe => !recipe.is_parsed);
        break;
      case 'with_errors':
        result = result.filter(recipe => recipe.parse_errors && recipe.parse_errors.length > 0);
        break;
      case 'no_errors':
        result = result.filter(recipe => !recipe.parse_errors || recipe.parse_errors.length === 0);
        break;
      default:
        break;
    }

    // Sort
    switch (sortBy) {
      case 'date_desc':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'date_asc':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'title_asc':
        result.sort((a, b) => a.title.localeCompare(b.title, 'he'));
        break;
      case 'title_desc':
        result.sort((a, b) => b.title.localeCompare(a.title, 'he'));
        break;
      case 'status':
        result.sort((a, b) => {
          if (a.is_parsed === b.is_parsed) return 0;
          return a.is_parsed ? -1 : 1;
        });
        break;
      default:
        break;
    }

    return result;
  }, [recipes, sortBy, filterBy]);

  // Infinite scroll for better performance
  const {
    displayedItems,
    hasMore,
    isLoading: isLoadingMore,
    observerTarget,
    displayedCount,
    totalItems
  } = useInfiniteScroll({
    items: filteredAndSortedRecipes,
    itemsPerPage: 20,
    initialPage: 1,
    threshold: 0.1
  });

  const handleSort = async (newSortBy: string) => {
    setSortBy(newSortBy);
  };

  const handleFilter = async (newFilterBy: string) => {
    setFilterBy(newFilterBy);
  };

  const commonProps = {
    recipes: displayedItems,
    selectedIds: selectedRecipes,
    onSelect: (id: number) => setSelectedRecipes(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    ),
    onRecipeUpdate: handleRecipeUpdate,
    hasMore,
    isLoadingMore,
    observerTarget
  };

  return (
    <div className="flex flex-col h-full">
      <RecipeToolbar
        selectedCount={selectedRecipes.length}
        onBulkAction={handleBulkAction}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isProcessing={isProcessing}
        onSort={handleSort}
        onFilter={handleFilter}
      />

      {/* Recipe Count Info */}
      {!loading && !error && totalItems > 20 && (
        <div className="px-6 py-2 text-sm text-secondary-600 bg-secondary-50 border-b">
          מציג {displayedCount} מתוך {totalItems} מתכונים
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner message="טוען מתכונים..." />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-red-500">
          {error}
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-secondary-500">לא נמצאו מתכונים</p>
            <p className="text-sm text-secondary-400 mt-2">נסה לשנות את הסינון או החיפוש</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {viewMode === 'list' ? (
            <RecipeList {...commonProps} />
          ) : (
            <RecipeGrid {...commonProps} />
          )}
        </div>
      )}

      {showMessage.status && (
        <TypingEffect
          message={showMessage.message}
          onComplete={handleMessageComplete}
        />
      )}
    </div>
  );
} 
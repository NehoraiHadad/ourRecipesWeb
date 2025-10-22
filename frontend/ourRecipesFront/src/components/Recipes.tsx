import { useState, useEffect } from "react";
import { recipe } from "@/types";
import { RecipeGridItem } from "./recipe/RecipeGridItem";
import { RecipeListItem } from "./recipe/RecipeListItem";
import { useFont } from '@/context/FontContext';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { RecipeCardSkeleton } from '@/components/ui/Skeleton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type ViewMode = 'grid' | 'list';

interface RecipesProps {
  recipes: recipe[];
  defaultView?: ViewMode;
  onRecipeClick?: (recipeId: number) => void;
}

const VIEW_MODE_KEY = 'recipeViewMode';

export default function Recipes({ recipes, defaultView = 'grid', onRecipeClick }: RecipesProps) {
  // Initialize with saved preference or default
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem(VIEW_MODE_KEY);
      return (savedMode === 'grid' || savedMode === 'list') ? savedMode : defaultView;
    }
    return defaultView;
  });

  const { currentFont } = useFont();

  // Infinite scroll with 20 items per page
  const {
    displayedItems,
    hasMore,
    isLoading,
    observerTarget,
    displayedCount,
    totalItems
  } = useInfiniteScroll({
    items: recipes,
    itemsPerPage: 20,
    initialPage: 1,
    threshold: 0.1
  });

  // Save preference when changed
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  return (
    <div className="flex flex-col min-h-full">
      <ViewModeToggle
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Recipe Count Info */}
      {totalItems > 20 && (
        <div className="px-4 py-2 text-sm text-secondary-600">
          מציג {displayedCount} מתוך {totalItems} מתכונים
        </div>
      )}

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-auto">
        <div className="relative pt-2">
          {/* Grid View */}
          <div className={`
            transition-all duration-300 ease-in-out
            ${viewMode === 'grid' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none hidden'}
          `}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayedItems.map((recipe) => (
                <RecipeGridItem
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => onRecipeClick?.(recipe.id)}
                  font={currentFont}
                />
              ))}

              {/* Loading Skeletons */}
              {isLoading && Array.from({ length: 4 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="p-2">
                  <RecipeCardSkeleton />
                </div>
              ))}
            </div>

            {/* Intersection Observer Target */}
            {hasMore && (
              <div
                ref={observerTarget}
                className="h-20 flex items-center justify-center"
              >
                {isLoading && (
                  <LoadingSpinner size="md" message="טוען מתכונים נוספים..." />
                )}
              </div>
            )}

            {/* End of List Message */}
            {!hasMore && displayedItems.length > 0 && (
              <div className="text-center py-8 text-secondary-500">
                זהו! הצגת את כל המתכונים
              </div>
            )}
          </div>

          {/* List View */}
          <div className={`
            transition-all duration-300 ease-in-out
            ${viewMode === 'list' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none hidden'}
          `}>
            <div>
              {displayedItems.map((recipe) => (
                <RecipeListItem
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => onRecipeClick?.(recipe.id)}
                  font={currentFont}
                />
              ))}

              {/* Loading Skeletons for List View */}
              {isLoading && Array.from({ length: 3 }).map((_, idx) => (
                <div key={`list-skeleton-${idx}`} className="px-2">
                  <RecipeCardSkeleton />
                </div>
              ))}
            </div>

            {/* Intersection Observer Target for List View */}
            {hasMore && (
              <div
                ref={observerTarget}
                className="h-20 flex items-center justify-center"
              >
                {isLoading && (
                  <LoadingSpinner size="md" message="טוען מתכונים נוספים..." />
                )}
              </div>
            )}

            {/* End of List Message */}
            {!hasMore && displayedItems.length > 0 && (
              <div className="text-center py-8 text-secondary-500">
                זהו! הצגת את כל המתכונים
              </div>
            )}
          </div>

          {/* Empty State */}
          {displayedItems.length === 0 && !isLoading && (
            <div className="text-center py-16">
              <p className="text-secondary-500 text-lg">לא נמצאו מתכונים</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

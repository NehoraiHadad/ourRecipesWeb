import { useState, useEffect } from "react";
import { recipe } from "@/types";
import { RecipeGridItem } from "./recipe/RecipeGridItem";
import { RecipeListItem } from "./recipe/RecipeListItem";
import { useFont } from '@/context/FontContext';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';

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

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-auto">
        <div className="relative pt-2">
          {/* Grid View */}
          <div className={`
            transition-all duration-300 ease-in-out
            ${viewMode === 'grid' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none hidden'}
          `}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {recipes.map((recipe) => (
                <RecipeGridItem
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => onRecipeClick?.(recipe.id)}
                  font={currentFont}
                />
              ))}
            </div>
          </div>

          {/* List View */}
          <div className={`
            transition-all duration-300 ease-in-out
            ${viewMode === 'list' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none hidden'}
          `}>
            <div>
              {recipes.map((recipe) => (
                <RecipeListItem
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => onRecipeClick?.(recipe.id)}
                  font={currentFont}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

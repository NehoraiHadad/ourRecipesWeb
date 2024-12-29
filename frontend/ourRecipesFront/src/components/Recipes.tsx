import { useState } from "react";
import { recipe } from "@/types";
import Modal from "./Modal";
import RecipeDetails from "@/components/recipe/RecipeDetails";
import { RecipeGridItem } from "./recipe/RecipeGridItem";
import { RecipeListItem } from "./recipe/RecipeListItem";
import { useFont } from '@/context/FontContext';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';

type ViewMode = 'grid' | 'list';

interface RecipesProps {
  recipes: recipe[];
  defaultView?: ViewMode;
}

export default function Recipes({ recipes, defaultView = 'grid' }: RecipesProps) {
  const [selectedRecipe, setSelectedRecipe] = useState<recipe | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const { currentFont } = useFont();
  const [isEditing, setIsEditing] = useState(false);

  const handleRecipeClick = (recipe: recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleCloseModal = () => {
    setSelectedRecipe(null);
  };

  const renderModalTitle = () => {
    if (!selectedRecipe) return null;
    return (
      <div className="flex items-center justify-center">
        <span>{isEditing ? 'עריכת מתכון' : selectedRecipe.title}</span>
      </div>
    );
  };

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recipes.map((recipe) => (
                <RecipeGridItem
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => handleRecipeClick(recipe)}
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
            <div className="space-y-4">
              {recipes.map((recipe) => (
                <RecipeListItem
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => handleRecipeClick(recipe)}
                  font={currentFont}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recipe Modal */}
      <Modal 
        isOpen={!!selectedRecipe} 
        onClose={() => {
          handleCloseModal();
          setIsEditing(false);
        }}
        title={renderModalTitle()}
        size={isEditing ? 'lg' : 'md'}
        className="transform transition-all duration-300 ease-out"
      >
        {selectedRecipe && (
          <div className="animate-fadeIn">
            <RecipeDetails 
              recipe={selectedRecipe}
              isEditing={isEditing}
              onEditStart={() => setIsEditing(true)}
              onEditEnd={() => setIsEditing(false)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

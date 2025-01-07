import { useState } from 'react';
import { useRecipeHistory } from '@/hooks/useRecipeHistory';
import Modal from '@/components/Modal';
import RecipeDetails from '@/components/recipe/RecipeDetails';
import { recipe } from '@/types';
import Spinner from '@/components/ui/Spinner';
import { Typography } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';

export function RecentlyViewedRecipes() {
  const { recentlyViewed, removeFromHistory, clearHistory, toggleLocalFavorite, isLocalFavorite } = useRecipeHistory();
  const [selectedRecipe, setSelectedRecipe] = useState<recipe | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (recentlyViewed.length === 0) {
    return null;
  }

  const handleRecipeClick = async (recipeId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/${recipeId}`,
        {
          credentials: 'include',
        }
      );
      if (response.ok) {
        const recipe = await response.json();
        setSelectedRecipe(recipe);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch recipe:', errorText);
        setError('לא ניתן לטעון את המתכון');
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
      setError('אירעה שגיאה בטעינת המתכון');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = (e: React.MouseEvent, recipeId: number) => {
    e.stopPropagation();
    removeFromHistory(recipeId);
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const viewedDate = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - viewedDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'כרגע';
    if (diffInMinutes < 60) return `לפני ${diffInMinutes} דקות`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `לפני ${diffInHours} שעות`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'אתמול';
    if (diffInDays < 7) return `לפני ${diffInDays} ימים`;
    
    return viewedDate.toLocaleDateString('he-IL');
  };

  return (
    <>
      <div className="bg-gradient-to-br from-white to-primary-50/30 rounded-lg shadow-warm p-4 border border-primary-100/30">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-primary-100/50">
              <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <Typography variant="h3" className="text-base font-medium text-primary-900">
              נצפו לאחרונה
            </Typography>
          </div>
          {recentlyViewed.length > 0 && (
            <Button
              variant="ghost"
              onClick={clearHistory}
              className="text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50/50"
            >
              נקה הכל
            </Button>
          )}
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {recentlyViewed.map((recipe) => (
            <div
              key={recipe.id}
              className="flex-shrink-0 w-48 group relative"
            >
              <div
                onClick={() => handleRecipeClick(recipe.id)}
                className="w-full text-right bg-white hover:bg-primary-50/50 
                         rounded-lg p-3 transition-all duration-200 relative cursor-pointer
                         border border-primary-100/20 shadow-sm hover:shadow-md
                         hover:border-primary-200/30"
              >
                <h3 className="text-sm font-medium text-secondary-800 line-clamp-1 group-hover:text-primary-900 mb-1">
                  {recipe.title}
                </h3>

                <p className="text-xs text-secondary-500 group-hover:text-primary-600">
                  {formatTimeAgo(recipe.lastViewedAt)}
                </p>

                {/* Action Buttons */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleRemove(e, recipe.id)}
                    className="p-1.5 rounded-full
                             opacity-0 group-hover:opacity-100 transition-all duration-200
                             hover:bg-red-50 text-secondary-400 hover:text-red-500
                             scale-90 group-hover:scale-100
                             hover:shadow-sm"
                    title="הסר מההיסטוריה"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Favorite Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLocalFavorite(recipe.id);
                    }}
                    className={`p-1.5 rounded-full transition-all duration-200
                             ${isLocalFavorite(recipe.id)
                               ? 'bg-red-50 text-red-500'
                               : 'opacity-0 group-hover:opacity-100 hover:bg-red-50 text-secondary-400 hover:text-red-500'
                             }
                             scale-90 group-hover:scale-100`}
                    title={isLocalFavorite(recipe.id) ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill={isLocalFavorite(recipe.id) ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Gradient Fade Effect */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      </div>

      {/* Recipe Modal */}
      <Modal
        isOpen={!!selectedRecipe || isLoading || !!error}
        onClose={() => {
          setSelectedRecipe(null);
          setIsEditing(false);
          setError(null);
        }}
        title={isEditing ? 'עריכת מתכון' : selectedRecipe?.title}
      >
        {isLoading && (
          <div className="flex justify-center items-center p-8">
            <Spinner message="טוען מתכון..." />
          </div>
        )}
        
        {error && (
          <div className="p-8 text-center">
            <Typography variant="body" className="text-red-600">
              {error}
            </Typography>
          </div>
        )}
        
        {selectedRecipe && !isLoading && !error && (
          <RecipeDetails
            recipe={selectedRecipe}
            isEditing={isEditing}
            onEditStart={() => setIsEditing(true)}
            onEditEnd={() => setIsEditing(false)}
          />
        )}
      </Modal>
    </>
  );
} 
"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import homeImage from "../../../public/homeImage.png";
import Spinner from "@/components/ui/Spinner";
import Recipes from "@/components/Recipes";
import Search from "@/components/Search";
import { recipe } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import Modal from "@/components/Modal";
import DraggableBubble from "@/components/DraggableButton";
import MealSuggestionForm from "@/components/MealSuggestionForm";
import { RecipeCardSkeleton } from '@/components/ui/Skeleton'
import { Typography } from "@/components/ui/Typography";
import { Container } from "@/components/ui/Container";
import { RecentlyViewedRecipes } from '@/components/RecentlyViewedRecipes';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useSearchContext } from '@/contexts/SearchContext';
import RecipeDetails from "@/components/recipe/RecipeDetails";
import { RecipeService } from "@/services/recipeService";

export default function Page() {
  const [mealSuggestionForm, setMealSuggestionForm] = useState(false);
  const [favoriteRecipes, setFavoriteRecipes] = useState<recipe[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);
  const { isAuthenticated, canEdit, isLoading } = useAuth("/login", false);
  const { favorites, setFavorites } = useFavorites();
  const { searchResults, resultCount, setSearchResults, setResultCount } = useSearchContext();
  
  // Recipe Modal State
  const [selectedRecipe, setSelectedRecipe] = useState<recipe | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecipeClick = async (recipeId: number) => {
    setIsLoadingRecipe(true);
    try {
      // Try to find recipe in existing data sources
      const recipe = Object.values(searchResults).find(r => r.id === recipeId) || 
                    favoriteRecipes.find(r => r.id === recipeId);
      
      if (recipe) {
        setSelectedRecipe(recipe);
      } else {
        // Fetch from server if not found locally
        const response = await RecipeService.getRecipeById(recipeId);
        setSelectedRecipe(response.data);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'לא ניתן למצוא את המתכון');
    } finally {
      setIsLoadingRecipe(false);
    }
  };

  // Update useEffect to fetch favorite recipes
  useEffect(() => {
    const fetchFavoriteRecipes = async () => {
      if (favorites.length === 0) {
        setFavoriteRecipes([]);
        setIsLoadingFavorites(false);
        return;
      }

      try {
        const promises = favorites.map(id => 
          RecipeService.getRecipeById(id)
            .then(res => {
              const recipeData = res.data;
              
              // Validate the response data
              if (!recipeData || typeof recipeData !== 'object') {
                console.error(`Invalid response for recipe ${id}:`, res);
                return null;
              }
              
              // Additional validation for required fields
              if (!recipeData.id || !recipeData.title) {
                console.error(`Recipe ${id} missing required fields:`, recipeData);
                return null;
              }
              
              return recipeData;
            })
            .catch(error => {
              if (error?.response?.status === 404) {
                console.warn(`Recipe ${id} not found - removing from favorites`);
                // Remove the non-existent recipe from favorites
                setFavorites(prev => prev.filter(favId => favId !== id));
              } else {
                console.error(`Error fetching recipe ${id}:`, error);
              }
              return null;
            })
        );
        
        const recipes = (await Promise.all(promises)).filter((recipe): recipe is recipe => {
          if (!recipe || typeof recipe !== 'object') return false;
          if (!('id' in recipe) || typeof recipe.id !== 'number') return false;
          return true;
        });
        
        setFavoriteRecipes(recipes);
      } catch (error) {
        console.error('Error fetching favorite recipes:', error);
      } finally {
        setIsLoadingFavorites(false);
      }
    };

    fetchFavoriteRecipes();
  }, [favorites, setFavorites]);

  if (isLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <Spinner message="מאמת..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <Spinner message="חוזר לדף הכניסה..." />
      </div>
    );
  }

  const handleSearch = (newRecipes: Record<string, recipe>) => {
    setSearchResults(newRecipes);   
    setResultCount(Object.keys(newRecipes).length);
  };

  return (
    <main className="h-[calc(100dvh-52px)] bg-secondary-50 flex flex-col overflow-hidden">
      <Container className="h-full flex flex-col overflow-hidden py-4 sm:py-6 px-4 sm:px-6">
        {/* Content Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Hero Section - Only show when no search results */}
          {Object.keys(searchResults).length === 0 && (
            <div className="flex items-center gap-4 sm:gap-6 mb-6 flex-shrink-0">
              {/* Text Content */}
              <div className="flex-1 text-right">
                <Typography 
                  variant="h1" 
                  className="text-xl sm:text-2xl text-primary-800 mb-1.5 font-medium"
                >
                  המתכונים המשפחתיים שלנו
                </Typography>
                <Typography 
                  variant="body" 
                  className="text-sm sm:text-base text-secondary-600"
                >
                  מקום בו כל המתכונים המשפחתיים 
                  <span className="text-primary-600 font-medium mx-1">נשמרים</span> 
                  ו<span className="text-primary-600 font-medium">משותפים</span>
                </Typography>
              </div>

              {/* Image */}
              <div className="relative w-28 h-28 sm:w-36 sm:h-36 flex-shrink-0 -my-4">
                <Image
                  src="/home-image.png"
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 640px) 112px, 144px"
                  className="object-contain"
                />
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 min-h-0 -mx-4 px-4 pb-8">
            {/* Recently Viewed & Favorites - Only show when no search results */}
            <div className={`transition-all duration-500 ease-in-out ${Object.keys(searchResults).length === 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-95 h-0 overflow-hidden'}`}>
              <RecentlyViewedRecipes onRecipeClick={handleRecipeClick} />
              
              {/* Favorite Recipes Section */}
              <div className="mt-4 sm:mt-6">
                <div className="bg-gradient-to-br from-white to-primary-50/30 rounded-lg shadow-warm p-4 border border-primary-100/30">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-full bg-red-100/50">
                      <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    </div>
                    <Typography variant="h3" className="text-base font-medium text-primary-900">
                      מתכונים מועדפים
                    </Typography>
                  </div>

                  {isLoadingFavorites ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
                      {[1, 2, 3, 4].map((n) => (
                        <RecipeCardSkeleton key={n} />
                      ))}
                    </div>
                  ) : favoriteRecipes.length > 0 ? (
                    <Recipes recipes={favoriteRecipes} onRecipeClick={handleRecipeClick} />
                  ) : null}
                </div>
              </div>
            </div>

            {/* Search Results */}
            <div className={`transition-all duration-500 ease-in-out ${Object.keys(searchResults).length > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 h-0 overflow-hidden'}`}>
              {Object.keys(searchResults).length > 0 && (
                <div className="pt-2">
                  <Recipes recipes={Object.values(searchResults)} onRecipeClick={handleRecipeClick} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search Component - Fixed at bottom */}
        <div className="flex-shrink-0 sticky bottom-0 bg-secondary-50 pt-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
          <Search 
            onSearch={handleSearch}
            resultCount={resultCount}
            className="shadow-warm border-t border-secondary-200/30"
          />
        </div>
      </Container>

      {/* Floating Action Button & Modals */}
      <DraggableBubble onClick={() => setMealSuggestionForm(!mealSuggestionForm)} />
      
      {/* Meal Suggestion Modal */}
      <Modal
        isOpen={mealSuggestionForm}
        onClose={() => setMealSuggestionForm(false)}
      >
        <MealSuggestionForm />
      </Modal>

      {/* Recipe Modal */}
      <Modal
        isOpen={!!selectedRecipe || isLoadingRecipe || !!error}
        onClose={() => {
          setSelectedRecipe(null);
          setIsEditing(false);
          setError(null);
        }}
        title={isEditing ? 'עריכת מתכון' : selectedRecipe?.title}
      >
        {isLoadingRecipe && (
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
        
        {selectedRecipe && !isLoadingRecipe && !error && (
          <RecipeDetails
            recipe={selectedRecipe}
            isEditing={isEditing}
            onEditStart={() => setIsEditing(true)}
            onEditEnd={() => setIsEditing(false)}
          />
        )}
      </Modal>
    </main>
  );
} 
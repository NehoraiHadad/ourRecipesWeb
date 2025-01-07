import { useState, useEffect, useCallback } from 'react';

interface ViewedRecipe {
  id: number;
  title: string;
  lastViewedAt: string;
}

interface UseRecipeHistoryReturn {
  recentlyViewed: ViewedRecipe[];
  addToRecentlyViewed: (recipe: { id: number; title: string }) => void;
  removeFromHistory: (recipeId: number) => void;
  clearHistory: () => void;
  localFavorites: number[];
  toggleLocalFavorite: (recipeId: number) => void;
  isLocalFavorite: (recipeId: number) => boolean;
}

const MAX_RECENT_RECIPES = 10;
const STORAGE_KEYS = {
  recentlyViewed: 'recently-viewed-recipes',
  favorites: 'favorite-recipes'
} as const;

export function useRecipeHistory(): UseRecipeHistoryReturn {
  const [recentlyViewed, setRecentlyViewed] = useState<ViewedRecipe[]>([]);
  const [localFavorites, setLocalFavorites] = useState<number[]>([]);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedRecents = localStorage.getItem(STORAGE_KEYS.recentlyViewed);
    const savedFavorites = localStorage.getItem(STORAGE_KEYS.favorites);

    if (savedRecents) {
      setRecentlyViewed(JSON.parse(savedRecents));
    }
    if (savedFavorites) {
      setLocalFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  // Add a recipe to recently viewed
  const addToRecentlyViewed = useCallback((recipe: { id: number; title: string }) => {
    console.log('Adding recipe to history:', recipe);
    
    setRecentlyViewed(prev => {
      console.log('Current history:', prev);
      
      // Check if the recipe is already at the top of the list
      if (prev[0]?.id === recipe.id) {
        console.log('Recipe already at top of list, skipping update');
        return prev;
      }
      
      // Remove the recipe if it already exists
      const filtered = prev.filter(r => r.id !== recipe.id);
      console.log('After filtering existing recipe:', filtered);
      
      // Add the new recipe at the start
      const newRecent: ViewedRecipe = {
        id: recipe.id,
        title: recipe.title,
        lastViewedAt: new Date().toISOString()
      };
      
      // Keep only the last MAX_RECENT_RECIPES
      const updated = [newRecent, ...filtered].slice(0, MAX_RECENT_RECIPES);
      console.log('Updated history:', updated);
      
      // Save to localStorage
      localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(updated));
      
      return updated;
    });
  }, []);

  // Remove a recipe from history
  const removeFromHistory = useCallback((recipeId: number) => {
    setRecentlyViewed(prev => {
      const updated = prev.filter(r => r.id !== recipeId);
      localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear entire history
  const clearHistory = useCallback(() => {
    setRecentlyViewed([]);
    localStorage.removeItem(STORAGE_KEYS.recentlyViewed);
  }, []);

  // Toggle a recipe's favorite status locally
  const toggleLocalFavorite = useCallback((recipeId: number) => {
    setLocalFavorites(prev => {
      const updated = prev.includes(recipeId)
        ? prev.filter(id => id !== recipeId)
        : [...prev, recipeId];
      
      // Save to localStorage
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(updated));
      
      return updated;
    });
  }, []);

  // Check if a recipe is in local favorites
  const isLocalFavorite = useCallback((recipeId: number): boolean => {
    return localFavorites.includes(recipeId);
  }, [localFavorites]);

  return {
    recentlyViewed,
    addToRecentlyViewed,
    removeFromHistory,
    clearHistory,
    localFavorites,
    toggleLocalFavorite,
    isLocalFavorite
  };
} 
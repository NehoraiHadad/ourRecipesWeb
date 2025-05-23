'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface ViewedRecipe {
  id: number;
  title: string;
  lastViewedAt: string;
}

interface RecipeHistoryContextType {
  recentlyViewed: ViewedRecipe[];
  addToRecentlyViewed: (recipe: { id: number; title: string }) => void;
  removeFromHistory: (recipeId: number) => void;
  clearHistory: () => void;
}

const MAX_RECENT_RECIPES = 10;
const STORAGE_KEY = 'recently-viewed-recipes';

const RecipeHistoryContext = createContext<RecipeHistoryContextType | undefined>(undefined);

export function RecipeHistoryProvider({ children }: { children: React.ReactNode }) {
  const [recentlyViewed, setRecentlyViewed] = useState<ViewedRecipe[]>([]);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedRecents = localStorage.getItem(STORAGE_KEY);
    if (savedRecents) {
      setRecentlyViewed(JSON.parse(savedRecents));
    }
  }, []);

  // Add a recipe to recently viewed
  const addToRecentlyViewed = useCallback((recipe: { id: number; title: string }) => {
    setRecentlyViewed(prev => {
      // Check if the recipe is already at the top of the list
      if (prev[0]?.id === recipe.id) {
        return prev;
      }
      
      // Remove the recipe if it already exists
      const filtered = prev.filter(r => r.id !== recipe.id);
      
      // Add the new recipe at the start
      const newRecent: ViewedRecipe = {
        id: recipe.id,
        title: recipe.title,
        lastViewedAt: new Date().toISOString()
      };
      
      // Keep only the last MAX_RECENT_RECIPES
      const updated = [newRecent, ...filtered].slice(0, MAX_RECENT_RECIPES);
      
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      
      return updated;
    });
  }, []);

  // Remove a recipe from history
  const removeFromHistory = useCallback((recipeId: number) => {
    setRecentlyViewed(prev => {
      const updated = prev.filter(r => r.id !== recipeId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear entire history
  const clearHistory = useCallback(() => {
    setRecentlyViewed([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <RecipeHistoryContext.Provider
      value={{
        recentlyViewed,
        addToRecentlyViewed,
        removeFromHistory,
        clearHistory,
      }}
    >
      {children}
    </RecipeHistoryContext.Provider>
  );
}

export function useRecipeHistory() {
  const context = useContext(RecipeHistoryContext);
  if (context === undefined) {
    throw new Error('useRecipeHistory must be used within a RecipeHistoryProvider');
  }
  return context;
} 
'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

interface FavoritesContextType {
  favorites: number[];
  toggleFavorite: (recipeId: number) => void;
  isFavorite: (recipeId: number) => boolean;
  setFavorites: (favorites: number[] | ((prev: number[]) => number[])) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const STORAGE_KEY = 'favorite-recipes';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  // Initialize state with localStorage value
  const [favorites, setFavorites] = useState<number[]>(() => {
    // Check if we're on the client side
    if (typeof window !== 'undefined') {
      const savedFavorites = localStorage.getItem(STORAGE_KEY);
      console.log('🔑 Loading favorites from localStorage:', savedFavorites);
      if (savedFavorites) {
        try {
          const parsed = JSON.parse(savedFavorites);
          console.log('✅ Parsed favorites:', parsed);
          return parsed;
        } catch (error) {
          console.error('❌ Error parsing favorites from localStorage:', error);
          return [];
        }
      }
      console.log('ℹ️ No favorites in localStorage');
    }
    return [];
  });

  const toggleFavorite = (recipeId: number) => {
    setFavorites(prev => {
      const updated = prev.includes(recipeId)
        ? prev.filter(id => id !== recipeId)
        : [...prev, recipeId];

      console.log(prev.includes(recipeId) ? `💔 Removing recipe ${recipeId} from favorites` : `❤️ Adding recipe ${recipeId} to favorites`);
      console.log('Updated favorites:', updated);

      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const isFavorite = (recipeId: number): boolean => {
    return favorites.includes(recipeId);
  };

  return (
    <FavoritesContext.Provider value={{ 
      favorites, 
      toggleFavorite, 
      isFavorite,
      setFavorites 
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
} 
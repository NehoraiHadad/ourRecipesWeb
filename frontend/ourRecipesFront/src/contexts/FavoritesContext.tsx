'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FavoritesContextType {
  favorites: number[]; // telegram_ids
  toggleFavorite: (telegramId: number) => void;
  isFavorite: (telegramId: number) => boolean;
  setFavorites: (favorites: number[] | ((prev: number[]) => number[])) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const STORAGE_KEY = 'favorite-recipes';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  // Initialize state as empty array - will be populated from localStorage in useEffect
  const [favorites, setFavoritesState] = useState<number[]>([]);
  // Track if we've loaded from localStorage to prevent overwriting it before load
  const [isInitialized, setIsInitialized] = useState(false);

  // Load favorites from localStorage on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedFavorites = localStorage.getItem(STORAGE_KEY);
      console.log('🔑 Loading favorites from localStorage:', savedFavorites);
      if (savedFavorites) {
        try {
          const parsed = JSON.parse(savedFavorites);
          console.log('✅ Parsed favorites:', parsed);
          setFavoritesState(parsed);
        } catch (error) {
          console.error('❌ Error parsing favorites from localStorage:', error);
        }
      } else {
        console.log('ℹ️ No favorites in localStorage');
      }
      // Mark as initialized after loading from localStorage
      setIsInitialized(true);
    }
  }, []); // Run only once on mount

  // Sync favorites to localStorage whenever they change (but only after initialization)
  useEffect(() => {
    // Only sync to localStorage after we've loaded from it
    if (typeof window !== 'undefined' && isInitialized) {
      console.log('💾 Syncing favorites to localStorage:', favorites);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    }
  }, [favorites, isInitialized]);

  // Wrapper for setFavorites that works with both direct values and updater functions
  const setFavorites = (value: number[] | ((prev: number[]) => number[])) => {
    setFavoritesState(value);
  };

  const toggleFavorite = (telegramId: number) => {
    setFavorites(prev => {
      const updated = prev.includes(telegramId)
        ? prev.filter(id => id !== telegramId)
        : [...prev, telegramId];

      console.log(prev.includes(telegramId) ? `💔 Removing recipe ${telegramId} from favorites` : `❤️ Adding recipe ${telegramId} to favorites`);
      console.log('Updated favorites:', updated);

      // localStorage sync happens automatically via useEffect
      return updated;
    });
  };

  const isFavorite = (telegramId: number): boolean => {
    return favorites.includes(telegramId);
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
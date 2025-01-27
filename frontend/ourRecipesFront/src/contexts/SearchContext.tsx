'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { recipe } from '@/types';

interface SearchContextType {
  searchResults: Record<string, recipe>;
  resultCount: number | "";
  setSearchResults: (results: Record<string, recipe>) => void;
  setResultCount: (count: number | "") => void;
  clearSearch: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [searchResults, setSearchResults] = useState<Record<string, recipe>>({});
  const [resultCount, setResultCount] = useState<number | "">("");

  const clearSearch = () => {
    setSearchResults({});
    setResultCount("");
  };

  return (
    <SearchContext.Provider value={{ 
      searchResults, 
      resultCount,
      setSearchResults,
      setResultCount,
      clearSearch
    }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearchContext() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearchContext must be used within a SearchProvider');
  }
  return context;
} 
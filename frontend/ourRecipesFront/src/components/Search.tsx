import React, { useState, useEffect, useCallback } from 'react';
import Spinner from '@/components/ui/Spinner';
import { useNotification } from '@/context/NotificationContext'
import { useFont } from '@/context/FontContext';
import { recipe } from '@/types'
import { FeatureIndicator } from '@/components/ui/FeatureIndicator';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/hooks/useDebounce';
import { SearchService, SearchResult } from '@/services/searchService';
import { CategoryService } from '@/services/categoryService';

interface SearchProps {
  onSearch: (newRecipes: Record<string, recipe>) => void
  resultCount?: number | ""
  className?: string
}

export function Search({ onSearch, resultCount, className }: SearchProps) {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    preparationTime: '',
    difficulty: '',
    includeTerms: [] as string[],
    excludeTerms: [] as string[]
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const { currentFont } = useFont();

  const debouncedQuery = useDebounce(query, 300);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const suggestionsResponse = await SearchService.getSearchSuggestions(searchQuery);

      // Handle suggestions - support both direct array and wrapped responses
      const suggestionsData = Array.isArray(suggestionsResponse) 
        ? suggestionsResponse 
        : (suggestionsResponse?.data || []);

      if (!Array.isArray(suggestionsData)) {
        console.error('Invalid suggestions format:', suggestionsResponse);
        setSuggestions([]);
      } else {
        setSuggestions(suggestionsData);
      }
    } catch (error) {
      console.error('Search suggestions failed:', error);
      setSuggestions([]);
      addNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'חיפוש הצעות נכשל',
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    handleSearch(debouncedQuery);
  }, [debouncedQuery, handleSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    // Trigger search automatically when suggestion is selected
    const searchParams = new URLSearchParams();
    searchParams.append('query', suggestion);
    performSearch(searchParams);
  };

  const performSearch = async (searchParams: URLSearchParams) => {
    setIsLoading(true);
    setShowSuggestions(false);
    setShowCategories(false);
    setShowAdvancedFilters(false);

    try {
      const response = await SearchService.search({
        query: searchParams.get('query') || '',
        ...(selectedCategories.length > 0 && { categories: selectedCategories }),
        ...(advancedFilters.preparationTime && { preparationTime: parseInt(advancedFilters.preparationTime) }),
        ...(advancedFilters.difficulty && { difficulty: advancedFilters.difficulty }),
        ...(advancedFilters.includeTerms.length > 0 && { includeTerms: advancedFilters.includeTerms }),
        ...(advancedFilters.excludeTerms.length > 0 && { excludeTerms: advancedFilters.excludeTerms })
      });

      console.log('Search response:', response); // For debugging

      if (!response) {
        onSearch({});
        addNotification({
          type: 'error',
          message: 'החיפוש נכשל - לא התקבלה תשובה',
          duration: 5000
        });
        return;
      }

      onSearch(response.results || {});
    } catch (error) {
      console.error('Search failed:', error);
      onSearch({});
      addNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'החיפוש נכשל',
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    switch (result.type) {
      case 'recipe':
        router.push(`/recipes/${result.id}`);
        break;
      case 'category':
        router.push(`/categories/${result.id}`);
        break;
      case 'place':
        router.push(`/places/${result.id}`);
        break;
    }
    setShowSuggestions(false);
  };

  useEffect(() => {
    fetchCategories();
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('form')) {
        setShowCategories(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const response = await CategoryService.getCategories();
      setAvailableCategories(response.data.map(category => category));
    } catch (error) {
      addNotification({
        message: 'שגיאה בטעינת קטגוריות',
        type: 'error',
        duration: 5000
      });
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const searchParams = new URLSearchParams();
    if (query) searchParams.append('query', query);
    if (selectedCategories.length > 0) {
      searchParams.append('categories', selectedCategories.join(','));
    }

    if (advancedFilters.preparationTime) {
      searchParams.append('prepTime', advancedFilters.preparationTime);
    }
    if (advancedFilters.difficulty) {
      searchParams.append('difficulty', advancedFilters.difficulty);
    }
    if (advancedFilters.includeTerms.length > 0) {
      searchParams.append('includeTerms', advancedFilters.includeTerms.join(','));
    }
    if (advancedFilters.excludeTerms.length > 0) {
      searchParams.append('excludeTerms', advancedFilters.excludeTerms.join(','));
    }

    await performSearch(searchParams);
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleInputFocus = () => {
    setShowCategories(true);
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setAdvancedFilters({
      preparationTime: '',
      difficulty: '',
      includeTerms: [],
      excludeTerms: []
    });
  };

  const handleSearchBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setShowCategories(false);
      setShowAdvancedFilters(false);
    }
  };

  return (
    <div className={`
      fixed bottom-0 inset-x-0 
      transition-all duration-300 ease-in-out
      ${showCategories || showAdvancedFilters ? 'h-auto max-h-[60vh]' : 'h-14'} 
      bg-gradient-to-t from-white/95 via-white/90 to-transparent
      backdrop-blur-sm
      z-10 ${className}
    `}>
      <div className="w-full h-full px-4 flex flex-col">
        <form
          role="search"
          onSubmit={handleSubmit}
          onBlur={handleSearchBlur}
          className="w-full max-w-3xl mx-auto py-2.5 flex-1 flex flex-col"
        >
          {/* Main Search Bar Row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center h-9 bg-white/90 backdrop-blur-sm rounded-lg border border-secondary-200 shadow-warm transition-all duration-200 focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-100/50">
              <input
                type="search"
                placeholder="חיפוש..."
                value={query}
                onChange={handleInputChange}
                onFocus={() => setShowSuggestions(true)}
                onBlur={(e) => {
                  if (!e.relatedTarget?.closest('.suggestions-dropdown')) {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }
                }}
                className="flex-1 px-3 py-1.5 text-sm bg-transparent outline-none"
              />
              
              {/* Suggestions Dropdown */}
              {showSuggestions && query.trim() && (
                <div className="suggestions-dropdown absolute bottom-full left-0 right-0 mb-1 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-secondary-100/50 max-h-60 overflow-y-auto z-50">
                  {isLoading ? (
                    <div className="p-4 text-center">
                      <Spinner size="sm" />
                    </div>
                  ) : (
                    <>
                      {suggestions.length > 0 && (
                        <div className="p-2 border-b border-secondary-100/50">
                          <div className="text-xs text-secondary-500 mb-1">הצעות חיפוש</div>
                          {suggestions.map((suggestion, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleSuggestionClick(suggestion)}
                              className="w-full text-right px-3 py-1.5 text-sm text-secondary-700 hover:bg-secondary-50/80 focus:bg-secondary-50/80 focus:outline-none transition-colors duration-150 ease-in-out first:rounded-t-lg last:rounded-b-lg"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}

                      {!suggestions.length && query.trim() && (
                        <div className="p-4 text-center text-secondary-500 text-sm">
                          לא נמצאו הצעות
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              
              {/* Advanced Search Button with Feature Indicator */}
              <FeatureIndicator
                featureId="advanced-search"
                className="w-2 h-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvancedFilters(!showAdvancedFilters);
                    setShowCategories(true);
                  }}
                  className="px-2 text-secondary-500 hover:text-primary-500 transition-colors border-r border-secondary-200"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </button>
              </FeatureIndicator>

              {/* Search Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="px-3 h-full flex items-center justify-center text-secondary-500 hover:text-primary-500 transition-colors"
              >
                {isLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Results Count Badge */}
            {(resultCount !== "" && !isLoading && resultCount !== undefined) && (
              <div 
                className={`
                  min-w-[70px] h-7 px-2.5
                  flex items-center justify-center gap-1.5
                  ${resultCount === 0 
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-primary-100 text-primary-700'
                  }
                  rounded-full text-xs font-medium
                  shadow-sm border border-secondary-200/50
                  whitespace-nowrap overflow-hidden text-ellipsis
                `}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">{resultCount ? resultCount : ""}</span>
                  <span className="truncate">
                    {resultCount === 1 
                      ? 'מתכון' 
                      : resultCount === 0 
                        ? 'לא נמצאו תוצאות' 
                        : 'מתכונים'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Categories Section - Reorganized */}
          <div className={`
            mt-3 transition-all duration-300
            ${(showCategories || showAdvancedFilters) ? 'opacity-100' : 'opacity-0 pointer-events-none h-0'}
          `}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`font-handwriting-${currentFont} text-lg text-secondary-700`}>
                    קטגוריות:
                  </span>
                  {(selectedCategories.length > 0 || 
                    advancedFilters.preparationTime || 
                    advancedFilters.difficulty || 
                    advancedFilters.includeTerms.length > 0 || 
                    advancedFilters.excludeTerms.length > 0) && (
                    <span className="bg-primary-100 text-primary-700 text-sm px-2 py-0.5 rounded-full">
                      {selectedCategories.length + 
                       (advancedFilters.preparationTime ? 1 : 0) + 
                       (advancedFilters.difficulty ? 1 : 0) + 
                       advancedFilters.includeTerms.length + 
                       advancedFilters.excludeTerms.length}
                    </span>
                  )}
                </div>
                {(selectedCategories.length > 0 || 
                  advancedFilters.preparationTime || 
                  advancedFilters.difficulty || 
                  advancedFilters.includeTerms.length > 0 || 
                  advancedFilters.excludeTerms.length > 0) && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-sm text-secondary-500 hover:text-secondary-700 transition-colors"
                  >
                    נקה הכל
                  </button>
                )}
              </div>
              
              {isLoadingCategories ? (
                <div className="h-8 flex items-center justify-center">
                  <Spinner size="sm" message="טוען..." />
                </div>
              ) : (
                <div className="relative">
                  {/* Gradient Shadows for Scroll Indication */}
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none z-10"></div>
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10"></div>
                  
                  {/* Horizontal Scrolling Container */}
                  <div className="overflow-x-auto scrollbar-none scroll-smooth">
                    <div className="flex gap-2 py-2 px-4">
                      {availableCategories.map(category => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => handleCategoryClick(category)}
                          className={`
                            px-3 py-1.5 rounded-full text-sm font-medium
                            transition-all duration-200 hover:-translate-y-0.5
                            flex-none
                            ${selectedCategories.includes(category)
                              ? 'bg-primary-500 text-white shadow-warm'
                              : 'bg-white border border-secondary-200 text-secondary-700 hover:bg-secondary-50'}
                          `}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Advanced Filters Section */}
            <div className="mt-4 border-t border-secondary-100 pt-4">
              {showAdvancedFilters && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-secondary-700">זמן הכנה:</label>
                      <select
                        value={advancedFilters.preparationTime}
                        onChange={(e) => setAdvancedFilters(prev => ({
                          ...prev,
                          preparationTime: e.target.value
                        }))}
                        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg
                                 bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                      >
                        <option value="">הכל</option>
                        <option value="15">עד 15 דקות</option>
                        <option value="30">עד 30 דקות</option>
                        <option value="60">עד שעה</option>
                        <option value="120">עד שתיים</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-secondary-700">רמת קושי:</label>
                      <select
                        value={advancedFilters.difficulty}
                        onChange={(e) => setAdvancedFilters(prev => ({
                          ...prev,
                          difficulty: e.target.value
                        }))}
                        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg
                                 bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                      >
                        <option value="">הכל</option>
                        <option value="easy">קל</option>
                        <option value="medium">בינוני</option>
                        <option value="hard">מורכב</option>
                      </select>
                    </div>
                  </div>

                  {/* Include/Exclude Terms */}
                  <div className="space-y-3">
                    <div className="col-span-2 space-y-1.5">
                      <label className="text-sm font-medium text-secondary-700">חייב להכיל:</label>
                      <input
                        type="text"
                        placeholder="הקלד מילים מופרדות בפסיקים..."
                        value={advancedFilters.includeTerms.join(', ')}
                        onChange={(e) => setAdvancedFilters(prev => ({
                          ...prev,
                          includeTerms: e.target.value.split(',').map(i => i.trim()).filter(Boolean)
                        }))}
                        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg
                                 bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100
                                 outline-none transition-all duration-200"
                      />
                    </div>

                    <div className="col-span-2 space-y-1.5">
                      <label className="text-sm font-medium text-secondary-700">לא להכיל:</label>
                      <input
                        type="text"
                        placeholder="הקלד מילים מופרדות בפסיקים..."
                        value={advancedFilters.excludeTerms.join(', ')}
                        onChange={(e) => setAdvancedFilters(prev => ({
                          ...prev,
                          excludeTerms: e.target.value.split(',').map(i => i.trim()).filter(Boolean)
                        }))}
                        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg
                                 bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100
                                 outline-none transition-all duration-200"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Search;

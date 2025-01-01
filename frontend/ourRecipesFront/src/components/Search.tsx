import React, { useState, useEffect } from 'react';
import Spinner from '@/components/ui/Spinner';
import { useNotification } from '@/context/NotificationContext'
import { useFont } from '@/context/FontContext';
import { recipe } from '@/types'

interface SearchProps {
  onSearch: (newRecipes: Record<string, recipe>) => void
  resultCount?: number | ""
  className?: string
}


const Search: React.FC<SearchProps> = ({ onSearch, resultCount, className }) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [startAnimation, setStartAnimation] = useState(false);
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
  const { addNotification } = useNotification()
  const { currentFont } = useFont();

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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch categories');
      const categories = await response.json();
      setAvailableCategories(categories);
    } catch (error) {
      addNotification({
        message: 'שגיאה בטעינת קטגוריות',
        type: 'error',
        duration: 5000
      })
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setStartAnimation(true);
    setShowCategories(false);
    setShowAdvancedFilters(false);

    try {
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

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/search?${searchParams.toString()}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to search recipes');
      }

      const data = await response.json();
      onSearch(data.results || {});
      
    } catch (error) {
      addNotification({
        message: 'שגיאה בחיפוש מתכונים',
        type: 'error',
        duration: 5000
      })
    } finally {
      setIsSearching(false);
    }
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
            <div className="flex-1 flex items-center h-9 bg-white/90 backdrop-blur-sm rounded-lg border border-secondary-200 shadow-warm transition-all duration-200 focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-100/50">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setShowCategories(true)}
                className="flex-1 px-3 py-1.5 text-sm bg-transparent outline-none"
                placeholder="חיפוש מתכונים..."
              />
              
              {/* Advanced Search Toggle */}
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

              {/* Search Button */}
              <button
                type="submit"
                disabled={isSearching}
                className="px-3 h-full flex items-center justify-center text-secondary-500 hover:text-primary-500 transition-colors"
              >
                {isSearching ? (
                  <Spinner size="sm" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Results Count Badge */}
            {(resultCount !== "" && !isSearching && resultCount !== undefined) && (
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
};

export default Search;

import React, { useState, useEffect } from 'react';
import Spinner from './Spinner';
import CategoryTags from './CategoryTags';

interface SearchProps {
  onSearch: (results: any) => void;
  resultCount?: number | "";
}

const Search: React.FC<SearchProps> = ({ onSearch, resultCount }) => {
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
      console.error('Error fetching categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setStartAnimation(true);

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
        throw new Error('Search failed');
      }

      const data = await response.json();
      onSearch(data.results || {});
    } catch (error) {
      console.error('Search error:', error);
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

  return (
    <div className="fixed bottom-0 w-full bg-[#f8f2ea] shadow-md z-10">
      <form
        role="search"
        onSubmit={handleSubmit}
        className="max-w-3xl mx-auto px-2 py-1"
      >
        {/* Search Bar and Count */}
        <div className="flex items-center gap-1">
          {(resultCount !== "" || isSearching) && (
            <div 
              className={`
                flex items-center justify-center h-7 
                ${startAnimation ? "w-7" : "w-0"}
                bg-brown text-white rounded-full text-sm
                transition-all duration-700 ease-in-out font-bold
                ${startAnimation && isSearching ? "animate-bounce" : ""}
              `}
            >
              {!isSearching && resultCount}
            </div>
          )}
          
          <div 
            className={`
              flex-1 flex items-center h-8
              bg-white rounded-lg 
              overflow-hidden
            `}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={handleInputFocus}
              className="flex-1 px-2 py-1 text-sm outline-none"
              placeholder="חיפוש מתכונים..."
              aria-label="חיפוש מתכונים"
            />
            <button
              type="submit"
              className="px-3 py-1 hover:bg-gray-100 transition-colors text-sm"
              disabled={isSearching}
              aria-label="חפש"
            >
              🔎
            </button>
          </div>
        </div>

        {/* Categories Section - Hidden by default */}
        {showCategories && (
          <div className={`
            transition-all duration-300 ease-in-out
            ${showCategories ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}
          `}>
            {isLoadingCategories ? (
              <div className="h-6 flex items-center justify-center">
                <Spinner message="טוען..." />
              </div>
            ) : availableCategories.length > 0 && (
              <div className="overflow-x-auto -mx-2 px-2">
                <div className="py-1">
                  <CategoryTags 
                    categories={availableCategories}
                    selectedCategories={selectedCategories}
                    onClick={handleCategoryClick}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Advanced Filters Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="text-sm text-gray-600 hover:text-gray-800 mt-1"
        >
          {showAdvancedFilters ? 'הסתר חיפוש מתקדם' : 'חיפוש מתקדם'}
        </button>

        {/* Advanced Filters Section */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-2 gap-2 mt-2 pb-2">
            <div>
              <label className="text-sm">זמן הכנה (בדקות):</label>
              <select
                value={advancedFilters.preparationTime}
                onChange={(e) => setAdvancedFilters(prev => ({
                  ...prev,
                  preparationTime: e.target.value
                }))}
                className="w-full px-2 py-1 text-sm border rounded"
              >
                <option value="">הכל</option>
                <option value="15">עד 15 דקות</option>
                <option value="30">עד 30 דקות</option>
                <option value="60">עד שעה</option>
                <option value="120">עד שעתיים</option>
              </select>
            </div>

            <div>
              <label className="text-sm">רמת קושי:</label>
              <select
                value={advancedFilters.difficulty}
                onChange={(e) => setAdvancedFilters(prev => ({
                  ...prev,
                  difficulty: e.target.value
                }))}
                className="w-full px-2 py-1 text-sm border rounded"
              >
                <option value="">הכל</option>
                <option value="easy">קל</option>
                <option value="medium">בינוני</option>
                <option value="hard">מורכב</option>
              </select>
            </div>

            {/* Ingredients Filter */}
            <div className="col-span-2">
              <label className="text-sm">חייב להכיל את המילים:</label>
              <input
                type="text"
                placeholder="הקלד מילים מופרדות בפסיקים"
                value={advancedFilters.includeTerms.join(', ')}
                onChange={(e) => setAdvancedFilters(prev => ({
                  ...prev,
                  includeTerms: e.target.value.split(',').map(i => i.trim()).filter(Boolean)
                }))}
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>

            <div className="col-span-2">
              <label className="text-sm">לא להכיל את המילים:</label>
              <input
                type="text"
                placeholder="הקלד מילים מופרדות בפסיקים"
                value={advancedFilters.excludeTerms.join(', ')}
                onChange={(e) => setAdvancedFilters(prev => ({
                  ...prev,
                  excludeTerms: e.target.value.split(',').map(i => i.trim()).filter(Boolean)
                }))}
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default Search;

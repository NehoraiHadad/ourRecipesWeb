import { useRef, useState } from 'react';
import { FilterPopup } from '@/components/ui/FilterPopup';
import { Typography } from '@/components/ui/Typography';

interface PlaceFiltersProps {
  searchQuery: string;
  selectedType: string;
  selectedArea: string;
  sortBy: string;
  onSearchChange: (query: string) => void;
  onTypeChange: (type: string) => void;
  onAreaChange: (area: string) => void;
  onSortChange: (sort: string) => void;
  areas: Array<{ value: string; label: string }>;
  resultsCount: number;
}

const placeTypes = [
  { value: '', label: 'כל הסוגים', emoji: '🏠' },
  { value: 'restaurant', label: 'מסעדה', emoji: '🍽️' },
  { value: 'cafe', label: 'בית קפה', emoji: '☕' },
  { value: 'bar', label: 'בר', emoji: '🍺' },
  { value: 'attraction', label: 'אטרקציה', emoji: '🎡' },
  { value: 'shopping', label: 'קניות', emoji: '🛍️' },
  { value: 'other', label: 'אחר', emoji: '📍' }
];

const sortOptions = [
  { value: 'newest', label: 'חדש ביותר' },
  { value: 'oldest', label: 'ישן ביותר' },
  { value: 'name', label: 'לפי שם' },
  { value: 'area', label: 'לפי אזור' }
];

export function PlaceFilters({
  searchQuery,
  selectedType,
  selectedArea,
  sortBy,
  onSearchChange,
  onTypeChange,
  onAreaChange,
  onSortChange,
  areas,
  resultsCount
}: PlaceFiltersProps) {
  const typeFilterRef = useRef<HTMLButtonElement>(null);
  const areaFilterRef = useRef<HTMLButtonElement>(null);
  const sortFilterRef = useRef<HTMLButtonElement>(null);
  const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
  const [isAreaFilterOpen, setIsAreaFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {/* Search Bar */}
      <div className="flex items-center gap-2 relative">
        <div className="flex-1 min-w-0 flex items-center h-9 bg-white/90 backdrop-blur-sm rounded-lg border border-secondary-200 shadow-warm transition-all duration-200 focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-100/50">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-transparent outline-none"
            placeholder="חיפוש המלצות..."
          />
          
          {/* Filters Toggle */}
          <button
            ref={typeFilterRef}
            type="button"
            onClick={() => setIsTypeFilterOpen(!isTypeFilterOpen)}
            className={`px-2 text-secondary-500 hover:text-primary-500 transition-colors border-r border-secondary-200 ${selectedType ? 'text-primary-600' : ''}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Area Filter Toggle */}
          <button
            ref={areaFilterRef}
            type="button"
            onClick={() => setIsAreaFilterOpen(!isAreaFilterOpen)}
            className={`px-2 text-secondary-500 hover:text-primary-500 transition-colors border-r border-secondary-200 ${selectedArea ? 'text-primary-600' : ''}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 7.2c0 7.3-8 11.8-8 11.8z" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Sort Toggle */}
          <button
            ref={sortFilterRef}
            type="button"
            onClick={() => setIsSortOpen(!isSortOpen)}
            className={`px-3 text-secondary-500 hover:text-primary-500 transition-colors ${sortBy !== 'newest' ? 'text-primary-600' : ''}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M6 12h12M9 18h6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Results Count */}
        {resultsCount > 0 && (
          <div className={`
            min-w-[70px] h-7 px-2.5
            flex items-center justify-center gap-1.5
            ${resultsCount === 0 
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-primary-100 text-primary-700'
            }
            rounded-full text-xs font-medium
            shadow-sm border border-secondary-200/50
            whitespace-nowrap overflow-hidden text-ellipsis
          `}>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{resultsCount}</span>
              <span className="truncate">
                {resultsCount === 1 
                  ? 'המלצה' 
                  : resultsCount === 0 
                    ? 'לא נמצאו תוצאות' 
                    : 'המלצות'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Active Filters */}
      {(selectedType || selectedArea || searchQuery) && (
        <div className="flex flex-wrap gap-2">
          {searchQuery && (
            <div className="inline-flex items-center bg-secondary-50 text-secondary-700 rounded-full px-3 py-1 text-sm border border-secondary-200">
              <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {searchQuery}
              <button
                onClick={() => onSearchChange('')}
                className="mr-2 hover:text-secondary-900"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          )}
          {selectedType && (
            <div className="inline-flex items-center bg-secondary-50 text-secondary-700 rounded-full px-3 py-1 text-sm border border-secondary-200">
              {placeTypes.find(t => t.value === selectedType)?.emoji}{' '}
              {placeTypes.find(t => t.value === selectedType)?.label}
              <button
                onClick={() => onTypeChange('')}
                className="mr-2 hover:text-secondary-900"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          )}
          {selectedArea && (
            <div className="inline-flex items-center bg-secondary-50 text-secondary-700 rounded-full px-3 py-1 text-sm border border-secondary-200">
              📍 {selectedArea}
              <button
                onClick={() => onAreaChange('')}
                className="mr-2 hover:text-secondary-900"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter Popups */}
      <div className="relative">
        <FilterPopup isOpen={isTypeFilterOpen} onClose={() => setIsTypeFilterOpen(false)} triggerRef={typeFilterRef}>
          {placeTypes.map((type) => (
            <button
              key={type.value}
              className={`w-full px-4 py-2.5 text-right hover:bg-secondary-50 transition-colors ${selectedType === type.value ? 'bg-primary-50 text-primary-600' : ''}`}
              onClick={() => {
                onTypeChange(type.value);
                setIsTypeFilterOpen(false);
              }}
            >
              {type.emoji} {type.label}
            </button>
          ))}
        </FilterPopup>

        <FilterPopup isOpen={isAreaFilterOpen} onClose={() => setIsAreaFilterOpen(false)} triggerRef={areaFilterRef}>
          {areas.map((area) => (
            <button
              key={area.value}
              className={`w-full px-4 py-2.5 text-right hover:bg-secondary-50 transition-colors ${selectedArea === area.value ? 'bg-primary-50 text-primary-600' : ''}`}
              onClick={() => {
                onAreaChange(area.value);
                setIsAreaFilterOpen(false);
              }}
            >
              {area.label}
            </button>
          ))}
        </FilterPopup>

        <FilterPopup isOpen={isSortOpen} onClose={() => setIsSortOpen(false)} triggerRef={sortFilterRef}>
          {sortOptions.map((option) => (
            <button
              key={option.value}
              className={`w-full px-4 py-2.5 text-right hover:bg-secondary-50 transition-colors ${sortBy === option.value ? 'bg-primary-50 text-primary-600' : ''}`}
              onClick={() => {
                onSortChange(option.value);
                setIsSortOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </FilterPopup>
      </div>
    </div>
  );
} 
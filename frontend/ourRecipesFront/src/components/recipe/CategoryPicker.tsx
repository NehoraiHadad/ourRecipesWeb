/**
 * Category chooser for the recipe edit form: free text plus a filtered list of
 * the categories already used in the channel (`GET /api/categories`).
 */
import React, { useEffect, useRef, useState } from 'react';
import CategoryTags from '@/components/CategoryTags';
import { CategoryService } from '@/services/categoryService';

interface CategoryPickerProps {
  categories: string[];
  onChange: (categories: string[]) => void;
}

const CategoryPicker: React.FC<CategoryPickerProps> = ({ categories, onChange }) => {
  const [existing, setExisting] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // `GET /api/categories` answers `{ data: string[] }`.
    CategoryService.getCategories()
      .then((response) => {
        if (Array.isArray(response?.data)) setExisting(response.data);
      })
      .catch((error) => console.error('Failed to fetch categories:', error));
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const add = (category: string) => {
    const value = category.trim();
    if (value && !categories.includes(value)) onChange([...categories, value]);
    setInput('');
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריות</label>
      <div className="relative w-full mb-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          placeholder="הוסף או בחר קטגוריה"
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(input);
            }
          }}
          onFocus={() => setShowDropdown(true)}
        />

        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {existing
              .filter((category) => category.toLowerCase().includes(input.toLowerCase()))
              .map((category) => (
                <div
                  key={category}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => add(category)}
                >
                  {category}
                </div>
              ))}
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <CategoryTags
          categories={categories}
          onClick={(category) => onChange(categories.filter((c) => c !== category))}
        />
      )}
    </div>
  );
};

export default CategoryPicker;

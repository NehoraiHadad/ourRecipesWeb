import React from 'react';

interface CategoryTagsProps {
  categories?: string[];
  selectedCategories?: string[];
  onClick?: (category: string) => void;
}

const CategoryTags: React.FC<CategoryTagsProps> = ({ 
  categories = [], 
  selectedCategories = [], 
  onClick 
}) => {
  if (!categories || categories.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 my-2">
      {categories.map((category, index) => {
        const isSelected = selectedCategories.includes(category);
        return (
          <span
            key={index}
            onClick={() => onClick?.(category)}
            className={`px-2 py-1 text-sm rounded-full 
              ${isSelected 
                ? 'bg-brown text-white' 
                : 'bg-gray-100 hover:bg-gray-200'} 
              ${onClick ? 'cursor-pointer' : ''} 
              transition-colors duration-300`}
          >
            {category}
          </span>
        );
      })}
    </div>
  );
};

export default CategoryTags; 
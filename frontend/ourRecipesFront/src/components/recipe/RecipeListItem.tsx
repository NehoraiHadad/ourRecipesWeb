import { recipe } from "@/types";
import Image from "next/image";
import { Typography } from "@/components/ui/Typography";
import { Tag } from "@/components/ui/Tag";
import { Card } from "@/components/ui/Card";
import { ClockIcon } from "@/components/ui/ClockIcon";
import { useFavorites } from '@/contexts/FavoritesContext';

interface RecipeListItemProps {
  recipe: recipe;
  onClick: () => void;
  font: string;
}

export function RecipeListItem({ recipe, onClick, font }: RecipeListItemProps) {
  const { toggleFavorite, isFavorite } = useFavorites();

  const getDifficultyInfo = (difficulty: string) => {
    const levels = {
      easy: { label: 'קל', variant: 'success' },
      medium: { label: 'בינוני', variant: 'warning' },
      hard: { label: 'מאתגר', variant: 'error' }
    } as const;
    
    return levels[difficulty as keyof typeof levels] || levels.medium;
  };

  return (
    <div className="p-2">
      <Card 
        onClick={onClick}
        className="group cursor-pointer transition-all duration-300
                  bg-white relative flex
                  border border-transparent hover:border-primary-100/50
                  shadow-sm hover:shadow-md hover:z-10"
      >
        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(recipe.id);
          }}
          className={`absolute top-2 right-2 p-1.5 rounded-full z-10
                     transition-all duration-200
                     ${isFavorite(recipe.id)
                       ? 'bg-red-50 text-red-500 opacity-100'
                       : 'opacity-0 group-hover:opacity-100 hover:bg-red-50 text-secondary-400 hover:text-red-500'
                     }
                     scale-90 group-hover:scale-100
                     hover:shadow-sm`}
          title={isFavorite(recipe.id) ? 'הסר ממועדפים' : 'הוסף למועדפים'}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill={isFavorite(recipe.id) ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Image Section - Fixed width */}
        <div className="w-32 sm:w-48 relative overflow-hidden flex-shrink-0 rounded-lg">
          {recipe.image ? (
            <>
              <Image
                src={recipe.image}
                alt={recipe.title}
                fill
                className="object-cover transform transition-transform duration-500 group-hover:scale-110"
                sizes="(max-width: 768px) 128px, 192px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </>
          ) : (
            <div className="h-full bg-gradient-to-br from-secondary-100 to-secondary-50 flex items-center justify-center">
              <span className="text-5xl">🍳</span>
            </div>
          )}
        </div>

        {/* Content Section - Flex with fixed spacing */}
        <div className="flex-1 p-3 md:p-4 flex flex-col overflow-hidden">
          {/* Title - Fixed height */}
          <div className="relative mb-4 overflow-hidden">
            <div className="overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              <Typography 
                variant="h4" 
                className={`font-handwriting-${font} whitespace-nowrap group-hover:text-primary-600 transition-colors`}
              >
                {recipe.title}
              </Typography>
            </div>
          </div>

          {/* Categories - Single line with horizontal scroll */}
          <div className="relative mb-4 overflow-hidden">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              {recipe.categories?.slice(0, 6).map((category, idx) => (
                <Tag 
                  key={idx} 
                  variant="secondary"
                  className="text-xs px-2.5 py-1 flex-shrink-0"
                >
                  {category}
                </Tag>
              ))}
              {(recipe.categories?.length || 0) > 6 && (
                <Tag variant="secondary" className="text-xs flex-shrink-0">
                  +{recipe.categories!.length - 6}
                </Tag>
              )}
            </div>
          </div>

          {/* Recipe Meta - Fixed height with flex */}
          <div className="relative mt-auto overflow-hidden">
            <div className="overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              <div className="flex items-center gap-3 text-sm text-secondary-600 min-h-[1.5rem] whitespace-nowrap">
                {recipe.preparation_time && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ClockIcon className="w-4 h-4" />
                    <span>{recipe.preparation_time} דקות</span>
                  </div>
                )}
                {recipe.difficulty && (
                  <Tag 
                    variant={getDifficultyInfo(recipe.difficulty).variant}
                    className="text-xs flex-shrink-0"
                  >
                    {getDifficultyInfo(recipe.difficulty).label}
                  </Tag>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
} 
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
        <div className="flex-1 p-3 md:p-4 flex flex-col">
          {/* Title - Fixed height */}
          <Typography 
            variant="h4" 
            className={`font-handwriting-${font} line-clamp-1 mb-4 group-hover:text-primary-600 transition-colors`}
          >
            {recipe.title}
          </Typography>

          {/* Categories - Single line with horizontal scroll */}
          <div className="relative mb-4">
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
          <div className="mt-auto flex items-center gap-3 text-sm text-secondary-600 min-h-[1.5rem]">
            {recipe.preparation_time && (
              <div className="flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4" />
                <span>{recipe.preparation_time} דקות</span>
              </div>
            )}
            {recipe.difficulty && (
              <Tag 
                variant={getDifficultyInfo(recipe.difficulty).variant}
                className="text-xs"
              >
                {getDifficultyInfo(recipe.difficulty).label}
              </Tag>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
} 
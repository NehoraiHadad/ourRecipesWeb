import { recipe } from "@/types";
import Image from "next/image";
import { Typography } from "@/components/ui/Typography";
import { Tag } from "@/components/ui/Tag";
import { Card } from "@/components/ui/Card";
import { ClockIcon } from "@/components/ui/ClockIcon";

interface RecipeListItemProps {
  recipe: recipe;
  onClick: () => void;
  font: string;
}

export function RecipeListItem({ recipe, onClick, font }: RecipeListItemProps) {
  const getDifficultyInfo = (difficulty: string) => {
    const levels = {
      easy: { label: 'קל', variant: 'success' },
      medium: { label: 'בינוני', variant: 'warning' },
      hard: { label: 'מאתגר', variant: 'error' }
    } as const;
    
    return levels[difficulty as keyof typeof levels] || levels.medium;
  };

  return (
    <Card 
      onClick={onClick}
      className="group cursor-pointer flex flex-row-reverse gap-4 p-3 sm:p-4
                transition-all duration-300 hover:shadow-lg border border-transparent
                hover:border-primary-100 bg-white relative overflow-hidden
                before:absolute before:inset-0 before:bg-primary-50/0 before:transition-colors
                before:duration-300 hover:before:bg-primary-50/50"
    >
      {/* Recipe Info - Always Right Aligned */}
      <div className="flex-1 min-w-0 flex flex-col py-1 relative z-10">
        <Typography 
          variant="h3" 
          className={`font-handwriting-${font} mb-2 line-clamp-1 group-hover:text-primary-800 
                     transition-colors relative`}
        >
          {recipe.title}
        </Typography>

        {/* Recipe Meta */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-secondary-600 mb-2">
          {recipe.preparation_time && (
            <div className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm rounded-full px-2 py-0.5
                          shadow-sm group-hover:shadow transition-shadow">
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-secondary-50">
                <ClockIcon className="w-3.5 h-3.5 text-secondary-700" />
              </span>
              <span className="text-xs sm:text-sm">{recipe.preparation_time} דקות</span>
            </div>
          )}
          {recipe.difficulty && (
            <Tag 
              variant={getDifficultyInfo(recipe.difficulty).variant}
              className="text-xs shadow-sm group-hover:shadow transition-shadow"
            >
              {getDifficultyInfo(recipe.difficulty).label}
            </Tag>
          )}
        </div>

        {/* Categories */}
        {recipe.categories && recipe.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {recipe.categories.map(category => (
              <Tag 
                key={category} 
                variant="secondary"
                className="text-xs px-2 py-0.5 bg-white/80 backdrop-blur-sm 
                         shadow-sm group-hover:shadow transition-shadow"
              >
                {category}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* Recipe Image - Always Left Aligned */}
      {recipe.image ? (
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden
                      shadow-md group-hover:shadow-lg transition-shadow">
          <Image
            src={recipe.image}
            alt={recipe.title}
            fill
            className="object-cover transform transition-transform duration-500 group-hover:scale-110"
            sizes="(max-width: 640px) 96px, 112px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>
      ) : (
        <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg bg-secondary-50 
                      flex items-center justify-center shadow-md group-hover:shadow-lg 
                      transition-shadow">
          <Typography variant="h2" className="text-secondary-400 group-hover:scale-110 transition-transform">
            🍽️
          </Typography>
        </div>
      )}
    </Card>
  );
} 
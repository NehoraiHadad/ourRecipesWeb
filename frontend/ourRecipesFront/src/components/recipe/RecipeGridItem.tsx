import { recipe } from "@/types";
import Image from "next/image";
import { Typography } from "@/components/ui/Typography";
import { Tag } from "@/components/ui/Tag";
import { Card } from "@/components/ui/Card";
import { ClockIcon } from "@/components/ui/ClockIcon";

interface RecipeGridItemProps {
  recipe: recipe;
  onClick: () => void;
  font: string;
}

export function RecipeGridItem({ recipe, onClick, font }: RecipeGridItemProps) {
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
      className="group cursor-pointer overflow-hidden transition-all duration-300 hover:scale-[1.02] 
                hover:shadow-xl bg-white relative h-full flex flex-col"
    >
      {/* Image Section */}
      <div className="aspect-[3/2] relative overflow-hidden flex-shrink-0">
        {recipe.image ? (
          <>
            <Image
              src={recipe.image}
              alt={recipe.title}
              fill
              className="object-cover transform transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </>
        ) : (
          <div className="h-full bg-gradient-to-br from-secondary-100 to-secondary-50 flex items-center justify-center">
            <span className="text-5xl">🍳</span>
          </div>
        )}
      </div>
      
      {/* Content Section */}
      <div className="p-3 md:p-4 flex flex-col flex-1">
        <Typography 
          variant="h4" 
          className={`font-handwriting-${font} line-clamp-1 mb-2 group-hover:text-primary-600 transition-colors`}
        >
          {recipe.title}
        </Typography>

        {/* Categories */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {recipe.categories?.slice(0, 3).map((category, idx) => (
            <Tag 
              key={idx} 
              variant="secondary"
              className="text-xs px-2.5 py-1"
            >
              {category}
            </Tag>
          ))}
          {(recipe.categories?.length || 0) > 3 && (
            <Tag variant="secondary" className="text-xs">
              +{recipe.categories!.length - 3}
            </Tag>
          )}
        </div>

        {/* Recipe Meta */}
        <div className="mt-auto flex items-center gap-3 text-sm text-secondary-600">
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
  );
} 
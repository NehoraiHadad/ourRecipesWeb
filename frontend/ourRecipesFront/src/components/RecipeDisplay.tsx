import React, { useState, useEffect } from "react";
import IngredientList from "./IngredientList";
import CategoryTags from './CategoryTags';
import { difficultyDisplay } from '@/utils/difficulty';
import { Difficulty, recipe } from '@/types';
import { shareRecipe } from '@/utils/share';
import { Button } from './ui/Button';

interface RecipeDisplayProps {
  recipe: recipe;
}

const RecipeDisplay: React.FC<RecipeDisplayProps> = ({ recipe }) => {
  const [multiplier, setMultiplier] = useState(1);
  const [selectedIngredients, setSelectedIngredients] = useState<boolean[]>([]);
  const [ingredients, setIngredients] = useState<(string | JSX.Element)[]>([]);

  useEffect(() => {
    if (recipe.ingredients) {
      setIngredients(recipe.ingredients);
      setSelectedIngredients(new Array(recipe.ingredients.length).fill(false));
    }
  }, [recipe.ingredients]);

  const handleIngredientClick = (index: number) => {
    setSelectedIngredients(prev => {
      const newSelected = [...prev];
      newSelected[index] = !newSelected[index];
      return newSelected;
    });
  };

  const handleMultiplyQuantities = () => {
    setMultiplier(prev => (prev === 1 ? 2 : 1));
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      {recipe.image && (
        <img
          src={
            recipe.image.startsWith("data:")
              ? recipe.image
              : `data:image/jpeg;base64,${recipe.image}`
          }
          alt={recipe.title}
          className="rounded-lg w-full h-auto mb-4"
        />
      )}
      <div className="p-4">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold text-center">{recipe.title}</h2>
          <Button
            variant="ghost"
            onClick={() => shareRecipe(recipe)}
            className="p-1.5 hover:bg-secondary-50"
            title="שתף מתכון"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 6 12 2 8 6" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="2" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
        </div>

        <div className="flex justify-center gap-4 mb-4 text-sm text-gray-600">
          {recipe.preparation_time && (
            <div className="flex items-center gap-1">
              <span>⏱️</span>
              <span>{recipe.preparation_time} דקות</span>
            </div>
          )}
          {recipe.difficulty && (
            <div className="flex items-center gap-1">
              <span>📊</span>
              <span>{difficultyDisplay[recipe.difficulty.toUpperCase() as keyof typeof difficultyDisplay]}</span>
            </div>
          )}
        </div>

        {recipe.categories && recipe.categories.length > 0 && (
          <div className="mb-4">
            <CategoryTags categories={recipe.categories} />
          </div>
        )}

        <div className="relative">
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div className="absolute left-1 top-0">
              <button
                onClick={handleMultiplyQuantities}
                className={`
                  ${
                    multiplier === 1
                      ? "bg-primary-600 hover:bg-primary-700"
                      : "bg-accent-600 hover:bg-accent-700"
                  }
                  text-white font-medium text-sm
                  px-3 py-1.5 rounded-lg
                  transition-colors duration-200
                  shadow-warm hover:shadow-warm-lg
                  focus:outline-none focus:ring-2 focus:ring-offset-1
                  ${multiplier === 1 ? "focus:ring-primary-500" : "focus:ring-accent-500"}
                `}
              >
                {multiplier === 1 ? "2X" : "1X"}
              </button>
            </div>
          )}
          <IngredientList
            ingredients={ingredients}
            selectedIngredients={selectedIngredients}
            onIngredientClick={handleIngredientClick}
          />
        </div>

        <div className="whitespace-pre-line my-4">
          {recipe.raw_content ? (
            recipe.raw_content.split("\n").map((line: string, index: number) => (
              <p key={index}>{line}</p>
            ))
          ) : recipe.instructions ? (
            Array.isArray(recipe.instructions) ? (
              recipe.instructions.map((instruction: string, index: number) => (
                <p key={index}>{instruction}</p>
              ))
            ) : (
              recipe.instructions.split("\n").map((line: string, index: number) => (
                <p key={index}>{line}</p>
              ))
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RecipeDisplay;

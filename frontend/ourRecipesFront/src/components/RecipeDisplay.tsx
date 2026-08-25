/**
 * A parsed recipe, rendered straight from the structured contract fields
 * (STRUCTURE_REFACTOR_TASKS.md §D1): title, categories, prep time, difficulty,
 * ingredients and instructions all come from `SerializedRecipe`. The browser
 * never parses recipe text — `RawRecipeView` handles messages the server could
 * not parse.
 */
import React, { useEffect, useState } from "react";
import { imageSrc } from '@/utils/imageSrc';
import { useFeatureAnnouncement } from '@/context/FeatureAnnouncementContext';
import { FeatureIndicator } from '@/components/ui/FeatureIndicator';
import CategoryTags from './CategoryTags';
import IngredientListView from './recipe/IngredientListView';
import ServingsMultiplier from './recipe/ServingsMultiplier';
import RecipeTimersPanel from './recipe/RecipeTimersPanel';
import { difficultyLabel } from '@/utils/difficulty';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';
import { shareRecipe } from '@/utils/share';
import { Button } from './ui/Button';
import { Typography } from './ui/Typography';

interface RecipeDisplayProps {
  recipe: SerializedRecipe;
  onPrepTimeClick?: () => void;
  showTimer?: boolean;
}

const RecipeDisplay: React.FC<RecipeDisplayProps> = ({ recipe, onPrepTimeClick, showTimer }) => {
  const { showFeature } = useFeatureAnnouncement();
  const [multiplier, setMultiplier] = useState(1);

  const title = recipe.title ?? '';
  const difficulty = difficultyLabel(recipe.difficulty);
  const instructionLines = (recipe.instructions ?? '').split('\n').filter((line) => line.trim());

  // Show the timer feature announcement the first time prep time is clicked.
  useEffect(() => {
    if (showTimer) {
      showFeature({
        id: 'recipe-timer',
        title: 'טיימר חכם למתכונים',
        description: 'לחץ על זמן ההכנה כדי להפעיל טיימר. המערכת תזהה אוטומטית זמני המתנה במתכון!'
      });
    }
  }, [showTimer, showFeature]);

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      {recipe.image_url && (
        <img
          src={imageSrc(recipe.image_url)}
          alt={title}
          className="rounded-lg w-full h-auto mb-4"
        />
      )}
      <div className="px-4 pt-4">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold text-center">{title}</h2>
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

        <div className="flex flex-col items-center mb-4">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-2 text-xs sm:text-sm text-gray-600">
            {recipe.preparation_time && (
              <FeatureIndicator featureId="recipe-timer">
                <div
                  className={`flex items-center gap-1 cursor-pointer transition-colors
                    ${showTimer ? 'text-primary-600' : 'hover:text-primary-600'}`}
                  onClick={onPrepTimeClick}
                  role="button"
                  title="לחץ להפעלת טיימר"
                >
                  <span>⏱️</span>
                  <span className="break-words">{recipe.preparation_time} דקות</span>
                </div>
              </FeatureIndicator>
            )}
            {difficulty && (
              <div className="flex items-center gap-1">
                <span>📊</span>
                <span className="break-words">{difficulty}</span>
              </div>
            )}
            {recipe.servings && (
              <div className="flex items-center gap-1">
                <span>🍽️</span>
                <span className="break-words">{recipe.servings} מנות</span>
              </div>
            )}
          </div>

          <RecipeTimersPanel
            recipeId={recipe.id.toString()}
            recipeName={title}
            instructions={recipe.instructions}
            preparationTime={recipe.preparation_time}
            showForm={Boolean(showTimer)}
          />
        </div>

        {recipe.categories.length > 0 && (
          <div className="mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            <CategoryTags categories={recipe.categories} />
          </div>
        )}

        {recipe.ingredients.length > 0 && (
          <div className="relative">
            <ServingsMultiplier value={multiplier} onChange={setMultiplier} />
            <Typography variant="h3" className="text-base font-medium text-secondary-700 mb-1">
              מצרכים
            </Typography>
            <IngredientListView ingredients={recipe.ingredients} multiplier={multiplier} />
          </div>
        )}

        {instructionLines.length > 0 && (
          <div className="mt-4">
            <Typography variant="h3" className="text-base font-medium text-secondary-700 mb-1">
              הוראות הכנה
            </Typography>
            <div className="space-y-1 leading-relaxed">
              {instructionLines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeDisplay;

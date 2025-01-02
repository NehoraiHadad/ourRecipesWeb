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

  const adjustMultiplier = (delta: number) => {
    setMultiplier(prev => {
      const newValue = Math.round((prev + delta) * 2) / 2; // Round to nearest 0.5
      return Math.min(Math.max(newValue, 0.5), 4); // Clamp between 0.5 and 4
    });
  };

  useEffect(() => {
    if (recipe.ingredients) {
      const adjustedIngredients = recipe.ingredients.map(ingredient => {
        // Searching for numbers, fractions, or quantity words in English at the beginning of the string
        const match = ingredient.match(/^([\d./]+|\d*\s*[½¼¾]|\d*\s*(חצי|רבע|שלושת רבעי|שליש|שני שליש|רבעי|שמינית))\s*/);
        if (match) {
          const quantity = match[1];
          const rest = ingredient.slice(match[0].length);
          
          // Converting the fraction or word to a number
          let numericQuantity = 0;
          
          // Converting Hebrew words to numbers
          if (typeof quantity === 'string') {
            switch(quantity.trim()) {
              case 'חצי':
                numericQuantity = 0.5;
                break;
              case 'רבע':
                numericQuantity = 0.25;
                break;
              case 'שלושת רבעי':
                numericQuantity = 0.75;
                break;
              case 'שליש':
                numericQuantity = 1/3;
                break;
              case 'שני שליש':
                numericQuantity = 2/3;
                break;
              case 'שמינית':
                numericQuantity = 0.125;
                break;
              default:
                // Checking for fractions
                if (quantity.includes('½')) {
                  numericQuantity = quantity.includes(' ') ? 
                    parseInt(quantity) + 0.5 : 
                    0.5;
                } else if (quantity.includes('¼')) {
                  numericQuantity = quantity.includes(' ') ? 
                    parseInt(quantity) + 0.25 : 
                    0.25;
                } else if (quantity.includes('¾')) {
                  numericQuantity = quantity.includes(' ') ? 
                    parseInt(quantity) + 0.75 : 
                    0.75;
                } else if (quantity.includes('/')) {
                  const [numerator, denominator] = quantity.split('/');
                  numericQuantity = parseInt(numerator) / parseInt(denominator);
                } else {
                  numericQuantity = parseFloat(quantity);
                }
            }
          }

          // Calculating the new quantity
          let newQuantity = (numericQuantity * multiplier).toFixed(2);
          const numValue = parseFloat(newQuantity);

          // Conversion back to the appropriate format
          if (numValue % 1 === 0) {
            // Integer
            newQuantity = numValue.toString();
          } else if (numValue === 0.5) {
            newQuantity = 'חצי';
          } else if (numValue === 0.25) {
            newQuantity = 'רבע';
          } else if (numValue === 0.75) {
            newQuantity = 'שלושת רבעי';
          } else if (numValue === 1/3) {
            newQuantity = 'שליש';
          } else if (numValue === 2/3) {
            newQuantity = 'שני שליש';
          } else if (numValue === 0.125) {
            newQuantity = 'שמינית';
          } else if (numValue % 0.5 === 0) {
            // Number and half
            const whole = Math.floor(numValue);
            newQuantity = whole === 0 ? 'חצי' : `${whole} וחצי`;
          } else if (numValue % 0.25 === 0) {
            // Number and quarter/three quarters
            const whole = Math.floor(numValue);
            const fraction = numValue - whole;
            if (fraction === 0.25) {
              newQuantity = whole === 0 ? 'רבע' : `${whole} ורבע`;
            } else if (fraction === 0.75) {
              newQuantity = whole === 0 ? 'שלושת רבעי' : `${whole} ושלושת רבעי`;
            }
          } else {
            // If we didn't find a nice representation, leave it as a decimal
            newQuantity = numValue.toFixed(2);
          }

          return `${newQuantity} ${rest}`;
        }
        return ingredient;
      });
      setIngredients(adjustedIngredients);
      setSelectedIngredients(new Array(recipe.ingredients.length).fill(false));
    }
  }, [recipe.ingredients, multiplier]);

  const handleIngredientClick = (index: number) => {
    setSelectedIngredients(prev => {
      const newSelected = [...prev];
      newSelected[index] = !newSelected[index];
      return newSelected;
    });
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
            <div className="absolute left-1 top-0 flex items-center gap-0.5 bg-white/95 backdrop-blur 
                          border border-primary-100 rounded-full py-1 pl-1 pr-2
                          shadow-sm hover:shadow-md transition-all duration-300">
              <button
                onClick={() => adjustMultiplier(-0.5)}
                className="text-primary-600 hover:text-primary-700 hover:bg-primary-50/50
                  w-6 h-6 rounded-full flex items-center justify-center
                  transition-all duration-200 relative
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-300/50
                  disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={multiplier <= 0.5}
                title="הקטן כמויות"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round"/>
                </svg>
              </button>
              <div className="w-12 text-center font-medium text-primary-700 text-sm tabular-nums">
                {multiplier}X
              </div>
              <button
                onClick={() => adjustMultiplier(0.5)}
                className="text-primary-600 hover:text-primary-700 hover:bg-primary-50/50
                  w-6 h-6 rounded-full flex items-center justify-center
                  transition-all duration-200 relative
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-300/50
                  disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={multiplier >= 4}
                title="הגדל כמויות"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="7" x2="12" y2="17" strokeLinecap="round"/>
                  <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round"/>
                </svg>
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

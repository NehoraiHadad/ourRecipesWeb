import React, { useState, useEffect } from "react";
import IngredientList from "./IngredientList";
import CategoryTags from './CategoryTags';

interface RecipeDisplayProps {
  recipe: {
    id: number;
    title: string;
    ingredients?: string[] | string;
    instructions?: string;
    raw_content?: string;
    image?: string | null;
    categories?: string[];
    preparation_time?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  };
}

const fractionMap: { [key: string]: number } = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const decimalToFraction: { [key: number]: string } = {
  0.25: "¼",
  0.5: "½",
  0.75: "¾",
  0.333: "⅓",
  0.666: "⅔",
  0.667: "⅔",
  0.2: "⅕",
  0.4: "⅖",
  0.6: "⅗",
  0.8: "⅘",
  0.167: "⅙",
  0.833: "⅚",
  0.125: "⅛",
  0.375: "⅜",
  0.625: "⅝",
  0.875: "⅞",
};

const hebrewWordsMap: { [key: string]: string } = {
  חצי: "1",
  רבע: "חצי",
  שליש: "שני שליש",
  "שני שליש": "1⅓",
  "שלושת רבעי": "1½",
  קורט: "קורט²",
};

const difficultyDisplay: { [key: string]: string } = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'מורכב'
};

const multiplyNumbersInString = (str: string, shouldMultiply: boolean = true): string => {
  if (!shouldMultiply) return str;
  
  let processedStr = str;
  let wasProcessed = false;
  
  processedStr = processedStr.replace(/(\d*)([½¼¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (match, whole, fraction) => {
    wasProcessed = true;
    let total = 0;
    
    if (whole) {
      total += parseInt(whole);
    }
    
    if (fraction && fraction in fractionMap) {
      total += fractionMap[fraction];
    }
    
    total *= 2;
    
    const wholePart = Math.floor(total);
    const fractionalPart = +(total - wholePart).toFixed(3);
    
    if (fractionalPart in decimalToFraction) {
      return `<span class="text-green-600">${wholePart || ''}${decimalToFraction[fractionalPart]}</span>`;
    }
    
    return `<span class="text-green-600">${total}</span>`;
  });


  if (!wasProcessed) {
    const words = processedStr.split(' ');
    const newWords = words.map(word => {
      const cleanWord = word.trim().replace(/[^\u0590-\u05FF]/g, '');
      
      if (cleanWord in hebrewWordsMap) {
        wasProcessed = true;
        return word.replace(cleanWord, `<span class="text-green-600">${hebrewWordsMap[cleanWord]}</span>`);
      }
      return word;
    });
    
    processedStr = newWords.join(' ');
  }


  if (!wasProcessed) {
    processedStr = processedStr.replace(/(?<!<")\b(\d+(?:\.\d+)?)\b(?!<")/g, (match) => {
      const number = parseFloat(match);
      const result = number * 2;
      return `<span class="text-green-600">${result}</span>`;
    });
  }

  return processedStr;
};

const RecipeDisplay: React.FC<RecipeDisplayProps> = ({ recipe }) => {
  const [selectedIngredients, setSelectedIngredients] = useState<boolean[]>([]);
  const [multiplier, setMultiplier] = useState(1);
  const [ingredients, setIngredients] = useState(recipe.ingredients);

  useEffect(() => {
    if (recipe.ingredients) {
      setSelectedIngredients(new Array(recipe.ingredients.length).fill(false));
      setIngredients(recipe.ingredients);
    }
  }, [recipe.ingredients]);

  const handleIngredientClick = (index: number) => {
    setSelectedIngredients((prev) => {
      const newSelected = [...prev];
      newSelected[index] = !newSelected[index];
      return newSelected;
    });
  };

  const handleMultiplyQuantities = () => {
    if (multiplier === 1 && recipe.ingredients) {
      const multipliedIngredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((ingredient: string) => 
            multiplyNumbersInString(ingredient, true)
          )
        : recipe.ingredients.split('\n').map((ingredient: string) =>
            multiplyNumbersInString(ingredient, true)
          );
      setIngredients(multipliedIngredients);
      setMultiplier(2);
    } else {
      setIngredients(recipe.ingredients);
      setMultiplier(1);
    }
  };

  return (
    <div className="recipe-container">
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
        <h2 className="text-2xl font-bold text-center mb-4">{recipe.title}</h2>

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
              <span>{difficultyDisplay[recipe.difficulty]}</span>
            </div>
          )}
        </div>

        {recipe.categories && recipe.categories.length > 0 && (
          <div className="mb-4">
            <CategoryTags categories={recipe.categories} />
          </div>
        )}

        <div className="relative">
          {recipe.ingredients && (Array.isArray(recipe.ingredients) ? recipe.ingredients.length > 0 : recipe.ingredients) && (
            <div className="absolute left-1 top-0">
              <button
                onClick={handleMultiplyQuantities}
                className={`
                flex items-center gap-2 
                ${
                  multiplier === 1
                    ? "bg-brown hover:bg-opacity-90"
                    : "bg-green-600 hover:bg-green-700"
                }
                text-white px-4 py-2 rounded-lg 
                transition-all duration-300 
                shadow-md hover:shadow-lg
              `}
              >
                {multiplier === 1 ? "2X" : "1X"}
              </button>
            </div>
          )}
          <IngredientList
            ingredients={Array.isArray(ingredients) ? ingredients : ingredients?.split('\n') || []}
            selectedIngredients={selectedIngredients}
            onIngredientClick={handleIngredientClick}
          />
        </div>

        <div className="whitespace-pre-line my-4">
          {recipe.raw_content ? (
            recipe.raw_content.split("\n").map((line, index) => (
              <p key={index}>{line}</p>
            ))
          ) : recipe.instructions ? (
            recipe.instructions.split("\n").map((line, index) => (
              <p key={index}>{line}</p>
            ))
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RecipeDisplay;

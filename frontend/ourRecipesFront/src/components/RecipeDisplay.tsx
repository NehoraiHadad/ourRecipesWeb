import React, { useState, useEffect } from "react";
import IngredientList from "./IngredientList";

interface RecipeProps {
  recipe: {
    title: string;
    ingredients: string[];
    instructions: string;
    image: string | null;
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

const convertToMixedFraction = (decimal: number): string => {
  const wholeNumber = Math.floor(decimal);
  const fraction = decimal - wholeNumber;

  // Round to 3 decimal places for comparison
  const roundedFraction = Number(fraction.toFixed(3));

  // If no fractional part, return just the whole number
  if (roundedFraction === 0) {
    return wholeNumber.toString();
  }

  // Get Unicode fraction symbol if exists
  const fractionSymbol = decimalToFraction[roundedFraction];

  // If no whole number, return just the fraction
  if (wholeNumber === 0) {
    return fractionSymbol || decimal.toFixed(2);
  }

  // Combine whole number and fraction
  return fractionSymbol
    ? `${fractionSymbol}${wholeNumber}`
    : decimal.toFixed(2);
};

const multiplyNumbersInString = (str: string): string => {
  let processedStr = str;
  let wasProcessed = false;

  // First handle regular numbers
  processedStr = processedStr.replace(/(\d+(?:\/\d+)?|\d*\.\d+)/g, (match) => {
    wasProcessed = true;
    if (match.includes("/")) {
      const [numerator, denominator] = match.split("/").map(Number);
      const decimal = (numerator / denominator) * 2;
      return `<span class="font-bold text-green-600">${convertToMixedFraction(decimal)}</span>`;
    }
    const num = parseFloat(match);
    return `<span class="font-bold text-green-600">${convertToMixedFraction(num * 2)}</span>`;
  });

  // Then handle Unicode fractions
  for (const [fraction, value] of Object.entries(fractionMap)) {
    if (processedStr.includes(fraction)) {
      wasProcessed = true;
      const newValue = value * 2;
      const wholeNumber = Math.floor(newValue);
      const remainingFraction = newValue - wholeNumber;

      const newFractionSymbol =
        decimalToFraction[Number(remainingFraction.toFixed(3))];

      const replacement =
        wholeNumber > 0
          ? `<span class="font-bold text-green-600">${newFractionSymbol || ""}${wholeNumber || ""}</span>`
          : `<span class="font-bold text-green-600">${newFractionSymbol || newValue.toString()}</span>`;

      processedStr = processedStr.replace(fraction, replacement);
    }
  }

  // Finally handle Hebrew words
  for (const [word, replacement] of Object.entries(hebrewWordsMap)) {
    const words = processedStr.split(/\s+/);

    const newWords = words.map((currentWord) => {
      const cleanWord = currentWord.replace(/[^\u0590-\u05FF]/g, "");
      return cleanWord === word 
        ? `<span class="font-bold text-green-600">${replacement}</span>` 
        : currentWord;
    });

    const newStr = newWords.join(" ");

    if (newStr !== processedStr) {
      processedStr = newStr;
    }
  }

  return processedStr;
};

const RecipeDisplay: React.FC<RecipeProps> = ({ recipe }) => {
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
    if (multiplier === 1) {
      const multipliedIngredients = recipe.ingredients.map((ingredient) =>
        multiplyNumbersInString(ingredient)
      );
      setIngredients(multipliedIngredients);
      setMultiplier(2);
    } else {
      setIngredients(recipe.ingredients);
      setMultiplier(1);
    }
  };

  return (
    <div>
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

        <div className="relative">
          {recipe.ingredients && recipe.ingredients.length > 0 && (
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
            ingredients={ingredients.map(ing => multiplier === 2 ? (
              <span dangerouslySetInnerHTML={{ __html: ing }} />
            ) : ing)}
            selectedIngredients={selectedIngredients}
            onIngredientClick={handleIngredientClick}
          />
        </div>

        <div className="whitespace-pre-line my-4">
          {recipe.instructions.split("\n").map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecipeDisplay;

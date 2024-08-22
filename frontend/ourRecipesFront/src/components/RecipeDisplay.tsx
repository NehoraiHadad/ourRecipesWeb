import React, { useState, useEffect } from "react";
import IngredientList from "./IngredientList";

interface RecipeProps {
  recipe: {
    title: string;
    ingredients: string[];
    instructions: string;
    image?: string;
  };
}

const RecipeDisplay: React.FC<RecipeProps> = ({ recipe }) => {
  console.log(recipe);
  
  const [selectedIngredients, setSelectedIngredients] = useState<boolean[]>([]);

  useEffect(() => {
    if (recipe.ingredients) {
      setSelectedIngredients(new Array(recipe.ingredients.length).fill(false));
    }
  }, [recipe.ingredients]);

  const handleIngredientClick = (index: number) => {
    setSelectedIngredients((prev) => {
      const newSelected = [...prev];
      newSelected[index] = !newSelected[index];
      return newSelected;
    });
  };

  return (
    <div>
      {recipe.image && (
        <img src={"data:image/jpeg;base64," + recipe.image} alt={recipe.title} className="rounded-lg" />
      )}
      <div className="p-4">
        <h2 className="text-2xl font-bold text-center mb-4">{recipe.title}</h2>
        <IngredientList
          ingredients={recipe.ingredients}
          selectedIngredients={selectedIngredients}
          onIngredientClick={handleIngredientClick}
        />
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

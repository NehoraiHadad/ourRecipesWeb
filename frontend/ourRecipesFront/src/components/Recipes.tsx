import { useState } from "react";
import RecipeLine from "./RecipeLine";
import { recipe } from "../../types";
import Modal from "./Modal";
import RecipeDetail from "./RecipeDetail";

export default function Recipes(recipes: recipe[]) {
  const [selectedRecipe, setSelectedRecipe] = useState<recipe | null>(null);

  const handleRecipeClick = (recipe: recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleCloseModal = () => {
    setSelectedRecipe(null);
  };
  return (
    <div className="overflow-y-auto w-full flex-grow">
      {Object.values(recipes).map((recipe: recipe) => (
        <div
          key={recipe.id}
          onClick={() => handleRecipeClick(recipe)}
          className="cursor-pointer"
        >
          <RecipeLine key={recipe["id"]} recipe={recipe} />
        </div>
      ))}
      <Modal isOpen={!!selectedRecipe} onClose={handleCloseModal}>
        {selectedRecipe && <RecipeDetail recipe={selectedRecipe} />}
      </Modal>
    </div>
  );
}

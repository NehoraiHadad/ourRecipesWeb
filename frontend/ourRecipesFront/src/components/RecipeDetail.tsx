import { recipe } from "../types";

interface RecipeDetailProps {
  recipe: recipe;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipe }) => {
  return (
    <div>
      {recipe.image && (
        <img src={recipe.image} alt={recipe.title} className="rounded-lg" />
      )}
      <h2 className="text-2xl font-bold mt-2">{recipe.title}</h2>
      <p className="mt-2 whitespace-pre-wrap">{recipe.details}</p>
    </div>
  );
};

export default RecipeDetail;

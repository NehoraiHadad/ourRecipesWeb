import React, { useState } from "react";
import { RecipeGridProps } from "../../types/management";
import ParseErrors from "../ParseErrors";
import RecipeModal from "../RecipeModal";
import { recipe } from "../../types/index";
import EditRecipeModal from "../EditRecipeModal";
import { useAuthContext } from "../../context/AuthContext";

const RecipeGrid: React.FC<RecipeGridProps> = ({
  recipes,
  selectedIds,
  onSelect,
  onRecipeUpdate,
}) => {
  const { authState } = useAuthContext();
  const [modalRecipe, setModalRecipe] = useState<recipe | null>(null);
  const [editModalRecipe, setEditModalRecipe] = useState<{
    id: number;
    title: string;
    ingredients: string[] | string;
    instructions?: string;
    raw_content?: string;
    image: string | null;
    categories?: string[];
    preparation_time?: number;
    difficulty?: "easy" | "medium" | "hard";
  } | null>(null);

  const handleRecipeClick = (recipe: recipe) => {
    setModalRecipe(recipe);
  };

  const handleCheckboxClick = (e: React.MouseEvent, recipeId: number) => {
    e.stopPropagation();
    onSelect(recipeId);
  };

  const handleEditClick = (e: React.MouseEvent, recipe: recipe) => {
    e.stopPropagation();
    setEditModalRecipe({
      id: recipe.telegram_id,
      title: recipe.title,
      ingredients: recipe.ingredients || [],
      instructions: recipe.is_parsed 
        ? Array.isArray(recipe.instructions) 
          ? recipe.instructions.join('\n') 
          : recipe.instructions
        : recipe.details || '',
      raw_content: recipe.raw_content,
      image: recipe.image || null,
      categories: recipe.categories || [],
      preparation_time: recipe.preparation_time,
      difficulty: recipe.difficulty?.toLowerCase() as "easy" | "medium" | "hard" | undefined
    });
  };

  const handleSaveEdit = async () => {
    if (editModalRecipe && onRecipeUpdate) {
      const formattedRecipe = `כותרת: ${editModalRecipe.title}
${editModalRecipe.categories?.length ? `\nקטגוריות: ${editModalRecipe.categories.join(', ')}` : ''}
${editModalRecipe.preparation_time ? `\nזמן הכנה: ${editModalRecipe.preparation_time} דקות` : ''}
${editModalRecipe.difficulty ? `\nרמת קושי: ${
  {
    'easy': 'קל',
    'medium': 'בינוני',
    'hard': 'קשה'
  }[editModalRecipe.difficulty]
}` : ''}
\nרשימת מצרכים:\n-${Array.isArray(editModalRecipe.ingredients) ? editModalRecipe.ingredients.join("\n-") : editModalRecipe.ingredients}
\nהוראות הכנה:\n${editModalRecipe.instructions || ""}`;

      try {
        const recipe = recipes.find(r => r.telegram_id === editModalRecipe.id);
        if (!recipe?.telegram_id) {
          throw new Error("Missing telegram_id");
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/recipes/update/${recipe.telegram_id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              newText: formattedRecipe,
              image: editModalRecipe.image,
            }),
          }
        );

        if (!response.ok) throw new Error("Failed to update recipe");

        const updatedRecipe = await response.json();
        await onRecipeUpdate(updatedRecipe);
      } catch (error) {
        console.error("Error updating recipe:", error);
      }
    }
    setEditModalRecipe(null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 p-6">
      {recipes.map((recipe) => (
        <div
          key={recipe.id}
          className={`
            relative bg-white rounded-xl shadow-lg overflow-hidden
            border ${
              recipe.is_parsed ? "border-green-400" : "border-yellow-400"
            }
            ${selectedIds.includes(recipe.id) ? "ring-2 ring-blue-400" : ""}
            cursor-pointer
            transform transition-all duration-200 hover:scale-102 hover:shadow-xl
          `}
          onClick={() => handleRecipeClick(recipe)}
        >
          {/* Checkbox */}
          <div
            className="absolute top-3 right-3 z-10"
            onClick={(e) => handleCheckboxClick(e, recipe.id)}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(recipe.id)}
              className="h-5 w-5 text-blue-500 rounded border-gray-300 focus:ring-blue-400 cursor-pointer"
              readOnly
            />
          </div>

          {recipe.image && (
            <div className="aspect-w-16 aspect-h-9">
              <img
                src={recipe.image}
                alt={recipe.title}
                className="object-cover w-full h-48 hover:opacity-90 transition-opacity duration-200"
              />
            </div>
          )}

          <div className="p-5">
            <h3 className="text-xl font-semibold mb-3 line-clamp-2 text-gray-800 text-center">
              {recipe.title}
            </h3>

            {recipe.categories && recipe.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {recipe.categories.map((category) => (
                  <span
                    key={category}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full font-medium"
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}

            <div className="text-sm text-gray-700">
              {recipe.is_parsed ? (
                <div className="space-y-3">
                  {recipe.ingredients && recipe.ingredients.length > 0 && (
                    <p className="line-clamp-2 bg-gray-50 p-2 rounded-lg">
                      <span className="font-medium">מצרכים: </span>
                      {recipe.ingredients.slice(0, 3).join(", ")}
                      {recipe.ingredients.length > 3 && "..."}
                    </p>
                  )}
                  {recipe.preparation_time && (
                    <p className="flex items-center gap-1">
                      <span className="font-medium">זמן הכנה:</span>
                      <span className="text-gray-600">{recipe.preparation_time} דקות</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="line-clamp-3 text-gray-600 bg-gray-50 p-2 rounded-lg">
                  {recipe.raw_content?.slice(0, 150)}...
                </p>
              )}
            </div>

            <ParseErrors
              errors={
                recipe.parse_errors
                  ? recipe.parse_errors.split("||").filter(Boolean)
                  : []
              }
              className="mt-3 text-sm text-red-500"
              showEmptyMessage={false}
            />

            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
              <span>
                נוצר: {new Date(recipe.created_at).toLocaleDateString("he-IL")}
              </span>
              {recipe.updated_at && (
                <span>
                  עודכן: {new Date(recipe.updated_at).toLocaleDateString("he-IL")}
                </span>
              )}
            </div>

            <div className="absolute top-3 left-3 z-10">
              {authState.canEdit && (
                <button
                  onClick={(e) => handleEditClick(e, recipe)}
                  className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md 
                           hover:bg-blue-200 transition-all duration-200"
                >
                  ערוך
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Modal */}
      {modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          onClose={() => setModalRecipe(null)}
          onUpdate={async (recipe) => await onRecipeUpdate(recipe)}
        />
      )}

      {editModalRecipe && (
        <EditRecipeModal
          show={true}
          onClose={() => setEditModalRecipe(null)}
          recipeData={editModalRecipe}
          setRecipeData={setEditModalRecipe}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
};

export default RecipeGrid;

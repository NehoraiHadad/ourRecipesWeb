import React, { useState } from "react";
import { recipe } from "../../types";
import { SwipeableListItem } from "../SwipeableListItem";
import RecipeModal from "../RecipeModal";
import { useAuthContext } from "../../context/AuthContext";
import ParseErrors from "../ParseErrors";
import EditRecipeModal from "../EditRecipeModal";

interface RecipeListProps {
  recipes: recipe[];
  selectedIds: number[];
  onSelect: (id: number) => void;
  onRecipeUpdate: (updatedRecipe: recipe) => void;
}

const RecipeList: React.FC<RecipeListProps> = ({
  recipes,
  selectedIds,
  onSelect,
  onRecipeUpdate,
}) => {
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
  
  const { authState } = useAuthContext();

  const handleRecipeClick = (recipe: recipe) => {
    setModalRecipe(recipe);
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

  const renderRecipePreview = (recipe: recipe) => {
    return (
      <div className="flex flex-col gap-2 cursor-pointer">
        {/* כותרת וסטטוס */}
        <div className="flex justify-between items-start">
          <h3 className="text-base font-medium">{recipe.title}</h3>
          <div className="flex items-center gap-2">
            {recipe.preparation_time && (
              <span className="text-xs text-gray-500">
                {recipe.preparation_time} דקות
              </span>
            )}
            {recipe.difficulty && (
              <span
                className={`px-2 py-1 rounded-full text-xs ${
                  {
                    EASY: "bg-green-100 text-green-800",
                    MEDIUM: "bg-yellow-100 text-yellow-800",
                    HARD: "bg-red-100 text-red-800",
                  }[recipe.difficulty]
                }`}
              >
                {
                  {
                    EASY: "קל",
                    MEDIUM: "בינוני",
                    HARD: "אתגר",
                  }[recipe.difficulty]
                }
              </span>
            )}
            <div
              className={`px-2 py-1 rounded-full text-xs ${
                recipe.is_parsed
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {recipe.is_parsed ? "מפורסר" : "ממתין לפרסור"}
            </div>
          </div>
        </div>

        {/* קטגוריות */}
        {recipe.categories && recipe.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.categories.map((category) => (
              <span
                key={category}
                className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
              >
                {category}
              </span>
            ))}
          </div>
        )}

        <div className="text-sm text-gray-600">
          {recipe.is_parsed ? (
            <div className="space-y-1">
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <p className="line-clamp-2">
                  מצרכים: {recipe.ingredients.slice(0, 3).join(", ")}
                  {recipe.ingredients.length > 3 && "..."}
                </p>
              )}
              {recipe.instructions && recipe.instructions.length > 0 && (
                <p className="line-clamp-2">
                  הוראות: {recipe.instructions[0]}
                  {recipe.instructions.length > 1 && "..."}
                </p>
              )}
            </div>
          ) : (
            <p className="line-clamp-2">
              {recipe.details?.slice(0, 150) ||
                recipe.raw_content?.slice(0, 150)}
              ...
            </p>
          )}
        </div>

        {/* שגיאות פרסור */}
        <ParseErrors
          errors={recipe.parse_errors?.split("||").filter(Boolean) || null}
          className="text-sm text-red-600"
          showEmptyMessage={false}
        />

        {/* מטא-דאטה */}
        <div className="text-xs text-gray-500 flex justify-between mt-2">
          <span>
            נוצר: {new Date(recipe.created_at).toLocaleDateString("he-IL")}
          </span>
          {recipe.updated_at && (
            <span>
              עודכן: {new Date(recipe.updated_at).toLocaleDateString("he-IL")}
            </span>
          )}
          {recipe.created_by && <span>נוצר ע"י: {recipe.created_by}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="divide-y divide-gray-200">
      {recipes.map((recipe) => (
        <div 
          key={recipe.id} 
          className={`p-4 ${selectedIds.includes(recipe.id) ? "bg-blue-50" : ""}`}
          onClick={() => handleRecipeClick(recipe)}
        >
          <div className="flex items-center gap-4">
            {/* Checkbox */}
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedIds.includes(recipe.id)}
                onChange={() => onSelect(recipe.id)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300"
              />
            </div>

            {/* Recipe Content */}
            <div className="flex-1">
              {renderRecipePreview(recipe)}
            </div>

            {/* Edit Button */}
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
      ))}

      {/* Recipe Modal */}
      {modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          onClose={() => setModalRecipe(null)}
          onUpdate={async (recipe) => await onRecipeUpdate(recipe)}
        />
      )}

      {/* Edit Modal */}
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

export default RecipeList;

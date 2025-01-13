import React, { useState } from "react";
import { recipe } from "../../types";
import RecipeModal from "../RecipeModal";
import { useAuthContext } from "../../context/AuthContext";
import ParseErrors from "../ParseErrors";
import Modal from "../Modal";
import { RecipeEditForm } from '../recipe/RecipeEditForm';
import { difficultyDisplay } from "@/utils/difficulty";

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
  const [editModalRecipe, setEditModalRecipe] = useState<recipe | null>(null);
  
  const { authState } = useAuthContext();

  const handleRecipeClick = (recipe: recipe) => {
    setModalRecipe(recipe);
  };

  const handleEditClick = (e: React.MouseEvent, recipe: recipe) => {
    e.stopPropagation();
    setEditModalRecipe({
      ...recipe,
      id: recipe.id,
      telegram_id: recipe.telegram_id,
      ingredients: recipe.ingredients || [],
      instructions: recipe.instructions || recipe.details || "",
      categories: recipe.categories || [],
      preparation_time: recipe.preparation_time,
      difficulty: recipe.difficulty,
    });
  };

  const handleSaveEdit = async (updatedFormData: recipe) => {
    console.log('Saving updated recipe:', updatedFormData); // Debug log
    
    if (editModalRecipe && onRecipeUpdate) {
      try {
        if (!editModalRecipe.telegram_id) {
          throw new Error("Missing telegram_id");
        }

        // Update the recipe data with the form changes
        const updatedRecipeData = {
          ...editModalRecipe,
          title: updatedFormData.title,
          ingredients: updatedFormData.ingredients,
          instructions: updatedFormData.instructions,
          image: updatedFormData.image,
          categories: updatedFormData.categories,
          preparation_time: updatedFormData.preparation_time,
          difficulty: updatedFormData.difficulty,
        };

        const formattedRecipe = `כותרת: ${updatedRecipeData.title}
${updatedRecipeData.categories?.length ? `\nקטגוריות: ${updatedRecipeData.categories.join(', ')}` : ''}
${updatedRecipeData.preparation_time ? `\nזמן הכנה: ${updatedRecipeData.preparation_time} דקות` : ''}
${updatedRecipeData.difficulty ? `\nרמת קושי: ${difficultyDisplay[updatedRecipeData.difficulty.toUpperCase() as keyof typeof difficultyDisplay]}` : ''}
\nרשימת מצרכים:\n-${Array.isArray(updatedRecipeData.ingredients) ? updatedRecipeData.ingredients.join("\n-") : updatedRecipeData.ingredients}
\nהוראות הכנה:\n${updatedRecipeData.instructions || ""}`;

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/recipes/update/${editModalRecipe.telegram_id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              newText: formattedRecipe,
              image: updatedRecipeData.image,
            }),
          }
        );

        if (!response.ok) throw new Error("Failed to update recipe");

        const updatedRecipe = await response.json();
        await onRecipeUpdate(updatedRecipe);
        setEditModalRecipe(null);
      } catch (error) {
        console.error("Error updating recipe:", error);
      }
    }
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
                    easy: "bg-green-100 text-green-800",
                    medium: "bg-yellow-100 text-yellow-800",
                    hard: "bg-red-100 text-red-800",
                  }[recipe.difficulty]
                }`}
              >
                {
                  difficultyDisplay[recipe.difficulty.toUpperCase() as keyof typeof difficultyDisplay]
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
            <div 
              onClick={(e) => e.stopPropagation()}
              className="relative flex items-center justify-center"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(recipe.id)}
                onChange={() => onSelect(recipe.id)}
                className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[4px] border-2 border-secondary-300
                         checked:border-primary-500 checked:bg-primary-500
                         hover:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:ring-offset-1
                         transition-all duration-200"
              />
              <svg
                className="pointer-events-none absolute opacity-0 peer-checked:opacity-100
                         transition-opacity duration-200"
                width="10"
                height="8"
                viewBox="0 0 10 8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1.5 4L3.5 6L8.5 1"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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

      {/* Modal for Recipe Edit */}
      <Modal 
        isOpen={!!editModalRecipe}
        onClose={() => setEditModalRecipe(null)}
        title="עריכת מתכון"
        size="lg"
      >
        {editModalRecipe && (
          <RecipeEditForm
            recipeData={editModalRecipe}
            onSave={async (updatedRecipe) => {
             
              await handleSaveEdit(updatedRecipe);
            }}
            onCancel={() => setEditModalRecipe(null)}
          />
        )}
      </Modal>
    </div>
  );
};

export default RecipeList;

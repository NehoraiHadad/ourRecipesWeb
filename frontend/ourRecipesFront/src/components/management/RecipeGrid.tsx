import React, { useState } from "react";
import { RecipeGridProps } from "../../types/management";
import ParseErrors from "../ParseErrors";
import RecipeModal from "../RecipeModal";
import { recipe } from "../../types/index";
import { useAuthContext } from "../../context/AuthContext";
import Image from "next/image";
import Modal from "../Modal";
import { RecipeEditForm } from '../recipe/RecipeEditForm';
import { difficultyDisplay } from "@/utils/difficulty";

const RecipeGrid: React.FC<RecipeGridProps> = ({
  recipes,
  selectedIds,
  onSelect,
  onRecipeUpdate,
}) => {
  const { authState } = useAuthContext();
  const [modalRecipe, setModalRecipe] = useState<recipe | null>(null);
  const [editModalRecipe, setEditModalRecipe] = useState<recipe | null>(null);

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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 p-6">
      {recipes.map((recipe) => (
        <div
          key={recipe.id}
          className={`
            relative bg-white rounded-xl shadow-warm overflow-hidden transition-all duration-300 hover:shadow-warm-lg hover:-translate-y-1
            border ${
              recipe.is_parsed ? "border-green-400" : "border-yellow-400"
            }
            ${selectedIds.includes(recipe.id) ? "ring-2 ring-blue-400" : ""}
            cursor-pointer
          `}
          onClick={() => handleRecipeClick(recipe)}
        >
          {/* Checkbox */}
          <div
            className="absolute top-3 right-3 z-10"
            onClick={(e) => handleCheckboxClick(e, recipe.id)}
          >
            <div className="relative flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-md p-0.5">
              <input
                type="checkbox"
                checked={selectedIds.includes(recipe.id)}
                className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[4px] border-2 border-secondary-300
                       checked:border-primary-500 checked:bg-primary-500
                       hover:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:ring-offset-1
                       transition-all duration-200"
                readOnly
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
          </div>

          <div className="aspect-w-16 aspect-h-9 relative overflow-hidden">
            {recipe.image ? (
              <div className="relative w-full h-48">
                <Image
                  src={recipe.image}
                  alt={recipe.title}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover transition-transform duration-300 hover:scale-105"
                />
              </div>
            ) : (
              <div className="w-full h-48 bg-secondary-100 flex items-center justify-center">
                <span className="text-4xl">🍳</span>
              </div>
            )}
          </div>

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

export default RecipeGrid;

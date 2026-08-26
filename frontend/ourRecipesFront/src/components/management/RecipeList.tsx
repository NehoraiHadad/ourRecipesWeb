import React, { useState } from "react";
import RecipeModal from "../RecipeModal";
import { useAuthContext } from "../../context/AuthContext";
import ParseErrors from "../ParseErrors";
import Modal from "../Modal";
import { RecipeEditForm, type RecipeEditPayload } from '../recipe/RecipeEditForm';
import { difficultyDisplay } from "@/utils/difficulty";
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RecipeCardSkeleton } from '@/components/ui/Skeleton';
import { RecipeService } from '@/services/recipeService';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';
import { hasStructuredContent, previewIngredientLines } from '@/lib/recipes/recipeView';
import { TrashIcon } from '@/components/ui/icons';
import { NeedsReviewBadge } from './NeedsReviewBadge';
import type { RecipeListProps } from '../../types/management';

const RecipeList: React.FC<RecipeListProps> = ({
  recipes,
  selectedIds,
  onSelect,
  onRecipeUpdate,
  onDelete,
  hasMore,
  isLoadingMore,
  observerTarget
}) => {
  const [modalRecipe, setModalRecipe] = useState<SerializedRecipe | null>(null);
  const [editModalRecipe, setEditModalRecipe] = useState<SerializedRecipe | null>(null);

  const { authState } = useAuthContext();

  /**
   * Refresh by `telegram_id` before opening a detail/edit dialog — the list
   * may be stale, and editing an out-of-date row would save over newer
   * content.
   */
  const loadFullRecipe = async (listRow: SerializedRecipe): Promise<SerializedRecipe> => {
    try {
      return await RecipeService.fetchRecipe(listRow.telegram_id);
    } catch (error) {
      console.error('Failed to load full recipe:', error);
      return listRow;
    }
  };

  const handleRecipeClick = async (recipe: SerializedRecipe) => {
    setModalRecipe(await loadFullRecipe(recipe));
  };

  /**
   * Editing always starts from the recipe itself (`GET /api/recipes/:id`),
   * never from the list projection — the list may be stale and saving over
   * newer content would lose it.
   */
  const handleEditClick = async (e: React.MouseEvent, listRow: SerializedRecipe) => {
    e.stopPropagation();
    try {
      setEditModalRecipe(await RecipeService.fetchRecipe(listRow.telegram_id));
    } catch (error) {
      console.error('Failed to load recipe for editing:', error);
    }
  };

  /**
   * The form hands over the finished channel message (built by
   * `formatRecipeText`); saving is one `PUT`, and the server re-parses it.
   */
  const handleSaveEdit = async (payload: RecipeEditPayload) => {
    if (!editModalRecipe || !onRecipeUpdate) return;

    try {
      const updated = await RecipeService.saveRecipe(editModalRecipe.telegram_id, payload);
      await onRecipeUpdate(updated);
      setEditModalRecipe(null);
    } catch (error) {
      console.error("Error updating recipe:", error);
    }
  };

  const renderRecipePreview = (recipe: SerializedRecipe) => {
    return (
      <div className="flex flex-col gap-2 cursor-pointer">
        {/* כותרת וסטטוס */}
        <div className="flex justify-between items-start">
          <h3 className="text-base font-medium">{recipe.title}</h3>
          <div className="flex items-center gap-2">
            {recipe.needs_review && <NeedsReviewBadge />}
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
          {hasStructuredContent(recipe) ? (
            <div className="space-y-1">
              {recipe.ingredients.length > 0 && (
                <p className="line-clamp-2">
                  מצרכים: {previewIngredientLines(recipe).join(", ")}
                  {recipe.ingredients.length > 3 && "..."}
                </p>
              )}
              {recipe.instructions && (
                <p className="line-clamp-2">הוראות: {recipe.instructions}</p>
              )}
            </div>
          ) : (
            <p className="line-clamp-2">
              {recipe.raw_content?.slice(0, 150)}
              ...
            </p>
          )}
        </div>

        {/* שגיאות פרסור */}
        <ParseErrors
          errors={recipe.parse_errors}
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

            {/* Edit / Delete Buttons */}
            {authState.canEdit && (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleEditClick(e, recipe)}
                  className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md
                           hover:bg-blue-200 transition-all duration-200"
                >
                  ערוך
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(recipe);
                  }}
                  className="p-1.5 text-red-600 bg-red-50 rounded-md
                           hover:bg-red-100 transition-all duration-200"
                  aria-label="מחק מתכון"
                >
                  <TrashIcon size="sm" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Loading Skeletons */}
      {isLoadingMore && Array.from({ length: 3 }).map((_, idx) => (
        <div key={`list-skeleton-${idx}`} className="p-4 border-b">
          <RecipeCardSkeleton />
        </div>
      ))}

      {/* Intersection Observer Target */}
      {hasMore && (
        <div
          ref={observerTarget}
          className="h-20 flex items-center justify-center border-t"
        >
          {isLoadingMore && (
            <LoadingSpinner size="md" message="טוען מתכונים נוספים..." />
          )}
        </div>
      )}

      {/* End of List Message */}
      {!hasMore && recipes.length > 0 && (
        <div className="text-center py-8 text-secondary-500 border-t">
          זהו! הצגת את כל המתכונים
        </div>
      )}

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
            recipe={editModalRecipe}
            onSave={handleSaveEdit}
            onCancel={() => setEditModalRecipe(null)}
          />
        )}
      </Modal>
    </div>
  );
};

export default RecipeList;

import React, { useState } from "react";
import { recipe } from "../types";
import Modal from "./Modal";
import { useAuthContext } from "../context/AuthContext";
import Spinner from "@/components/ui/Spinner";
import ParseErrors from "./ParseErrors";
import { useNotification } from '@/context/NotificationContext'

interface RecipeModalProps {
  recipe: recipe;
  onClose: () => void;
  onUpdate: (updatedRecipe: recipe) => Promise<void>;
}

const RecipeModal: React.FC<RecipeModalProps> = ({
  recipe,
  onClose,
  onUpdate,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedRecipe, setEditedRecipe] = useState(recipe);
  const { authState } = useAuthContext();
  const { addNotification } = useNotification()

  const handleUpdate = async () => {
    if (!authState.canEdit) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/${recipe.telegram_id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(editedRecipe),
        }
      );

      if (!response.ok) throw new Error("Failed to update recipe");

      const updatedRecipe = await response.json();
      onUpdate(updatedRecipe);
      addNotification({
        message: 'המתכון עודכן בהצלחה',
        type: 'success',
        duration: 3000
      })
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'אירעה שגיאה בעדכון המתכון'
      addNotification({
        message,
        type: 'error',
        duration: 5000
      })
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-medium">
              {recipe.title?.replace("כותרת:", "").trim()}
            </h3>
            <span className="text-xs text-gray-500">#{recipe.telegram_id}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">
              ⏱️ {recipe.preparation_time || "לא צוין"}{" "}
              {recipe.preparation_time && "דקות"}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full ${
                recipe.is_parsed
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {recipe.is_parsed ? "מפורסר" : "ממתין"}
            </span>
          </div>
        </div>

        <div className="divide-y">
          <div className="p-3">
            <div className="text-xs text-gray-500 mb-1">קטגוריות:</div>
            <div className="flex flex-wrap gap-2">
              {recipe.categories && recipe.categories.length > 0 ? (
                recipe.categories.map((category) => (
                  <span
                    key={category}
                    className="px-2 py-0.5 bg-gray-100 rounded-full text-xs"
                  >
                    {category}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">
                  לא הוגדרו קטגוריות
                </span>
              )}
            </div>
          </div>

          <Collapsible
            title="מצרכים והוראות"
            badge={recipe.ingredients?.length || 0}
            showEmpty
          >
            <div className="space-y-3 p-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">מצרכים:</div>
                {recipe.ingredients && recipe.ingredients.length > 0 ? (
                  <div className="flex gap-1 flex-wrap">
                    {recipe.ingredients.map((ing, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-50 rounded text-xs"
                      >
                        {ing}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">לא נמצאו מצרכים</span>
                )}
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">הוראות הכנה:</div>
                {recipe.instructions ? (
                  <div className="text-xs text-gray-600 whitespace-pre-wrap">
                    {recipe.instructions}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">
                    לא נמצאו הוראות הכנה
                  </span>
                )}
              </div>
            </div>
          </Collapsible>

          <Collapsible
            title="תוכן מקורי"
            badge={
              recipe.raw_content?.length > 100
                ? "100+"
                : recipe.raw_content?.length || 0
            }
            showEmpty
          >
            {recipe.raw_content ? (
              <pre className="p-3 text-xs text-gray-600 whitespace-pre-wrap text-right">
                {recipe.raw_content}
              </pre>
            ) : (
              <div className="p-3 text-xs text-gray-400">אין תוכן מקורי</div>
            )}
          </Collapsible>

          <Collapsible
            title="שגיאות"
            badge={recipe.parse_errors ? recipe.parse_errors.split('||').filter(Boolean).length : 0}
            className={recipe.parse_errors ? "bg-red-50" : undefined}
            showEmpty
          >
            <ParseErrors
              errors={recipe.parse_errors ? recipe.parse_errors.split('||').filter(Boolean) : []}
              className="p-3 text-xs text-red-600 space-y-1"
              showEmptyMessage={true}
            />
          </Collapsible>

          <Collapsible title="תמונה" showEmpty>
            <div className="p-3">
              {recipe.image ? (
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-full h-auto rounded"
                />
              ) : (
                <div className="text-xs text-gray-400 text-center py-4">
                  לא נמצאה תמונה
                </div>
              )}
            </div>
          </Collapsible>

          <div className="p-3 flex justify-between text-xs text-gray-500">
            <span>
              נוצר: {new Date(recipe.created_at).toLocaleDateString()}
            </span>
            <span>
              עודכן:{" "}
              {recipe.updated_at
                ? new Date(recipe.updated_at).toLocaleDateString()
                : "לא עודכן"}
            </span>
          </div>
        </div>

        <div className="p-3 border-t flex justify-end gap-2">
          {error && (
            <span className="text-xs text-red-600 ml-auto">{error}</span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            סגור
          </button>
          {authState.canEdit && (
            <button
              onClick={handleUpdate}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? <Spinner /> : "שמור"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

interface CollapsibleProps {
  title: string;
  children: React.ReactNode;
  badge?: number | string;
  className?: string;
  showEmpty?: boolean;
}

const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  children,
  badge,
  className,
  showEmpty,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 flex items-center justify-between text-sm hover:bg-gray-50"
      >
        <span>{title}</span>
        {(badge !== undefined || showEmpty) && (
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${
              badge ? "bg-gray-100" : "bg-gray-50 text-gray-400"
            }`}
          >
            {badge || "ריק"}
          </span>
        )}
      </button>
      {isOpen && children}
    </div>
  );
};

export default RecipeModal;

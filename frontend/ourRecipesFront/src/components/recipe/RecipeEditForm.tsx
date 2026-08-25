/**
 * Manual recipe editing (STRUCTURE_REFACTOR_TASKS.md §E1).
 *
 * The form edits the structured fields and hands its caller the finished
 * channel message, built by `formatRecipeText` through `recipeDraft` — the
 * caller only has to `PUT { newText, image }`, and the server re-parses it.
 *
 * A recipe the server could not parse has no structured content to show, so
 * for those the form edits the channel message itself rather than silently
 * dropping everything that is not a recognised section.
 */
import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SerializedRecipe } from "@/lib/serializers/recipeTypes";
import { hasStructuredContent } from "@/lib/recipes/recipeView";
import { difficultyOptions } from "@/utils/difficulty";
import type { RecipeDifficultyValue } from "@/lib/recipes/parserLabels";
import CategoryPicker from "./CategoryPicker";
import RecipeImageField from "./RecipeImageField";
import { draftFromRecipe, draftToChannelText, draftToPlainText, type RecipeDraft } from "./recipeDraft";

export interface RecipeEditPayload {
  /** The channel message to save — already in canonical format. */
  newText: string;
  image: string | null;
}

interface RecipeEditFormProps {
  recipe: SerializedRecipe;
  onSave: (payload: RecipeEditPayload) => void | Promise<void>;
  onCancel: () => void;
}

export function RecipeEditForm({ recipe, onSave, onCancel }: RecipeEditFormProps) {
  const [draft, setDraft] = useState<RecipeDraft>(() => draftFromRecipe(recipe));
  const [rawText, setRawText] = useState(recipe.raw_content);
  const isStructured = hasStructuredContent(recipe);

  const update = (changes: Partial<RecipeDraft>) => setDraft((prev) => ({ ...prev, ...changes }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSave({
      newText: isStructured ? draftToChannelText(draft) : rawText,
      image: draft.image
    });
  };

  const fieldClass = "w-full px-3 py-2 border border-gray-300 rounded-md";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <RecipeImageField
        image={draft.image}
        onChange={(image) => update({ image })}
        recipeContent={isStructured ? draftToPlainText(draft) : rawText}
      />

      {!isStructured ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            תוכן המתכון
          </label>
          <p className="text-xs text-gray-500 mb-2">
            המתכון הזה שמור כטקסט חופשי — עריכה כאן נשמרת כפי שהיא לערוץ.
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className={`${fieldClass} font-mono text-sm`}
            rows={16}
          />
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כותרת</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              className={fieldClass}
            />
          </div>

          <CategoryPicker
            categories={draft.categories}
            onChange={(categories) => update({ categories })}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                זמן הכנה (בדקות)
              </label>
              <input
                type="number"
                min="0"
                value={draft.preparationTime}
                onChange={(e) => update({ preparationTime: e.target.value })}
                className={fieldClass}
                placeholder="למשל: 30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">רמת קושי</label>
              <select
                value={draft.difficulty}
                onChange={(e) => update({ difficulty: e.target.value as RecipeDifficultyValue | '' })}
                className={fieldClass}
              >
                <option value="">בחר רמת קושי</option>
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מצרכים</label>
            <textarea
              value={draft.ingredientsText}
              onChange={(e) => update({ ingredientsText: e.target.value })}
              className={fieldClass}
              rows={5}
              placeholder="כל מצרך בשורה חדשה"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הוראות הכנה</label>
            <textarea
              value={draft.instructions}
              onChange={(e) => update({ instructions: e.target.value })}
              className={fieldClass}
              rows={8}
              placeholder="פרט את שלבי ההכנה"
            />
          </div>
        </>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        <Button variant="primary" type="submit">
          שמור שינויים
        </Button>
      </div>
    </form>
  );
}

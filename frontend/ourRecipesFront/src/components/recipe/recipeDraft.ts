/**
 * The edit form's working copy of a recipe, and the single conversion back to
 * a channel message (STRUCTURE_REFACTOR_TASKS.md §E1).
 *
 * The form edits ingredient *lines* (that is what a cook types); they are
 * prefilled with `formatIngredient` from the structured field and handed to
 * `formatRecipeText`, the parser's own inverse — no component assembles the
 * `כותרת:` / `רשימת מצרכים:` text by hand any more, and the server re-parses
 * whatever comes back on write.
 */
import { formatIngredient } from '@/lib/recipes/ingredientParser';
import { formatRecipeText, type FormatRecipeInput } from '@/lib/recipes/recipeFormatter';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';
import { toDifficultyEnum } from '@/utils/difficulty';
import type { RecipeDifficultyValue } from '@/lib/recipes/parserLabels';

export interface RecipeDraft {
  title: string;
  categories: string[];
  /** One ingredient per line, exactly as it will be written to the channel. */
  ingredientsText: string;
  instructions: string;
  /** Kept as text so the field can be cleared while typing. */
  preparationTime: string;
  difficulty: RecipeDifficultyValue | '';
  image: string | null;
}

export function draftFromRecipe(recipe: SerializedRecipe): RecipeDraft {
  return {
    title: recipe.title ?? '',
    categories: recipe.categories,
    ingredientsText: recipe.ingredients.map(formatIngredient).filter(Boolean).join('\n'),
    instructions: recipe.instructions ?? '',
    preparationTime: recipe.preparation_time ? String(recipe.preparation_time) : '',
    difficulty: toDifficultyEnum(recipe.difficulty) ?? '',
    image: recipe.image_url
  };
}

/** The draft as the parser's input shape. */
export function draftToFormatInput(draft: RecipeDraft): FormatRecipeInput {
  const preparationTime = Number(draft.preparationTime);

  return {
    title: draft.title.trim(),
    categories: draft.categories,
    ingredients: draft.ingredientsText
      .split('\n')
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean),
    instructions: draft.instructions.trim(),
    preparationTime: Number.isFinite(preparationTime) && preparationTime > 0 ? preparationTime : undefined,
    difficulty: draft.difficulty || undefined
  };
}

/** The canonical channel message for a draft. */
export function draftToChannelText(draft: RecipeDraft): string {
  return formatRecipeText(draftToFormatInput(draft));
}

/** What the AI image prompt needs — the recipe in plain words, not markup. */
export function draftToPlainText(draft: RecipeDraft): string {
  return [draft.title, draft.ingredientsText, draft.instructions].filter(Boolean).join('\n');
}

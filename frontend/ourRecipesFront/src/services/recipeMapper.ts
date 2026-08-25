import { formatIngredient } from '@/lib/recipes/ingredientParser';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';
import type { recipe as Recipe } from '../types';

/**
 * TODO(stage-D): temporary adapter from the shared wire type
 * ({@link SerializedRecipe}, what every `/api/recipes/*` route now returns) to
 * the legacy UI view model `recipe`.
 *
 * Stage C stopped the API from speaking the old `||`/CSV dialect: there is no
 * translation left to do, only two shapes the not-yet-rewritten components
 * still insist on — ingredients as text lines and `parse_errors` as one
 * `||`-joined string. Stage D repoints `RecipeDetails` / `RecipeDisplay` /
 * `RecipeEditForm` / `VersionHistory` / `MealSuggestionForm` at
 * `SerializedRecipe` and deletes this file.
 *
 * The `details` double meaning is gone: it is **always** `raw_content` (the
 * channel message), never "the instructions".
 */
export function toUiRecipe(row: SerializedRecipe): Recipe {
  return {
    // Scalars pass through unchanged — the wire type is already the UI's
    // dialect (lowercase difficulty, `string[]` categories, ISO dates).
    ...row,
    title: row.title ?? '',
    details: row.raw_content,
    ingredients: row.ingredients.map(formatIngredient).filter(Boolean),
    instructions: row.instructions ?? undefined,
    difficulty: row.difficulty ?? undefined,
    preparation_time: row.preparation_time ?? undefined,
    parse_errors: row.parse_errors.length > 0 ? row.parse_errors.join('||') : null,
    updated_at: row.updated_at ?? undefined,
    image: row.image_url ?? undefined
  };
}

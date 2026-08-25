/**
 * The one rule that decides how a recipe is rendered
 * (STRUCTURE_REFACTOR_TASKS.md §D1/§D3).
 *
 * `is_parsed` is strict — it is false when *any* expected section is missing,
 * including a recipe that has perfectly good ingredients and steps but no
 * difficulty line. Falling back to raw text for those would be a regression,
 * so the view also accepts a recipe that carries both structured ingredients
 * and instructions. Everything else (free-form messages from the channel,
 * unsaved AI text) is shown by `RawRecipeView`.
 */
import { formatIngredient } from '@/lib/recipes/ingredientParser';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';

type RenderableRecipe = Pick<SerializedRecipe, 'is_parsed' | 'ingredients' | 'instructions'>;

export function hasStructuredContent(recipe: RenderableRecipe): boolean {
  if (recipe.ingredients.length > 0 && Boolean(recipe.instructions?.trim())) return true;
  return recipe.is_parsed;
}

/**
 * The first `max` ingredients as text lines, for a card/list-row preview.
 * Reuses `formatIngredient` (the parser's own inverse) rather than
 * re-deriving a snippet — management/search previews never parse text.
 */
export function previewIngredientLines(
  recipe: Pick<SerializedRecipe, 'ingredients'>,
  max = 3
): string[] {
  return recipe.ingredients.slice(0, max).map(formatIngredient).filter(Boolean);
}

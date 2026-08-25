/**
 * Builds a `SerializedRecipe`-shaped preview from a server-parsed AI
 * suggestion/refinement that has not been saved yet
 * (`POST /api/recipes/suggest`, `/api/recipes/refine`).
 *
 * There is no DB row behind this text — `id`/`telegram_id` are `0` — so the
 * shape exists purely to let the browser render the preview through the same
 * structured components (`RecipeDisplay`/`RawRecipeView`) that render a saved
 * recipe, instead of re-parsing the AI's channel-format text client-side
 * (STRUCTURE_REFACTOR_TASKS.md §D2).
 */
import type { ParsedRecipe } from '@/lib/recipes/parser';
import type { DifficultyValue, SerializedRecipe } from '@/lib/serializers/recipeTypes';

const DIFFICULTY_TO_VALUE: Record<'EASY' | 'MEDIUM' | 'HARD', DifficultyValue> = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

export function serializePreviewFromParsed(parsed: ParsedRecipe): SerializedRecipe {
  return {
    id: 0,
    telegram_id: 0,
    title: parsed.title || null,
    raw_content: parsed.raw,
    categories: parsed.categories,
    ingredients: parsed.structuredIngredients,
    instructions: parsed.instructions || null,
    difficulty: parsed.difficulty ? DIFFICULTY_TO_VALUE[parsed.difficulty] : null,
    preparation_time: parsed.preparationTime ?? null,
    cooking_time: null,
    servings: null,
    image_url: null,
    is_parsed: parsed.isParsed,
    parse_errors: parsed.parseErrors,
    status: 'ACTIVE',
    sync_status: 'synced',
    is_verified: false,
    created_at: new Date().toISOString(),
    updated_at: null
  };
}

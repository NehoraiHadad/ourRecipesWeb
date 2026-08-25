/**
 * The recipe wire contract (STRUCTURE_REFACTOR_TASKS.md §C1) — the one type
 * both the API routes and the UI import.
 *
 * Kept free of runtime imports so a browser module can `import type` from it
 * without dragging Prisma or `node:crypto` into the bundle; the serializer
 * that produces these objects lives in `./recipe`.
 *
 * Deliberately **structured only**: `ingredients` comes from the
 * `ingredients_list` JSON column and `parse_errors` is a real array. The
 * legacy `ingredients` (`||`-joined text), `formatted_content` and
 * `recipe_metadata` columns are not exposed — they are dropped from the schema
 * right after this code ships (§5, decision 2). There is no `details` field:
 * the raw channel text has exactly one name, `raw_content`.
 */
import type { StructuredIngredient } from '@/lib/recipes/ingredientParser';

export type { StructuredIngredient };

/** The difficulty values the UI renders (`RecipeDifficulty.EASY` -> `'easy'`). */
export type DifficultyValue = 'easy' | 'medium' | 'hard';

export interface SerializedRecipe {
  id: number;
  telegram_id: number;
  title: string | null;
  /** The channel message — human source of truth and `is_parsed=false` fallback. */
  raw_content: string;
  categories: string[];
  ingredients: StructuredIngredient[];
  instructions: string | null;
  difficulty: DifficultyValue | null;
  preparation_time: number | null;
  cooking_time: number | null;
  servings: number | null;
  image_url: string | null;
  is_parsed: boolean;
  parse_errors: string[];
  status: string;
  sync_status: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface SerializedRecipeVersionSummary {
  id: number;
  version_num: number | null;
  created_at: string;
  change_description: string | null;
}

export interface SerializedUserRecipe {
  user_id: string;
  is_favorite: boolean;
}

/** What the single-recipe routes (`GET`/`PUT /api/recipes/:id`, `POST`) return. */
export interface SerializedRecipeWithRelations extends SerializedRecipe {
  user_recipes: SerializedUserRecipe[];
  versions: SerializedRecipeVersionSummary[];
}

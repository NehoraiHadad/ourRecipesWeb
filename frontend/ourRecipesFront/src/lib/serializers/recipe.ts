/**
 * The single recipe serializer (STRUCTURE_REFACTOR_TASKS.md §C1).
 *
 * Every recipe read path — `GET /api/recipes/search`, `GET /api/recipes/manage`,
 * `GET`/`PUT /api/recipes/[telegram_id]`, `POST /api/recipes` — selects with
 * {@link recipeSelect} (or {@link recipeWithRelationsSelect}) and answers with
 * {@link serializeRecipe}. No route hand-rolls a projection any more.
 *
 * One select, not a list/detail pair: `raw_content` is the channel's human
 * source of truth, the text the edit form loads, and the only thing an
 * `is_parsed=false` recipe can render — the management grid and the search
 * results need it as much as the recipe modal does. The response shape itself
 * lives in `./recipeTypes` (importable from the browser).
 */
import type { Prisma, RecipeDifficulty } from '@prisma/client';
import { difficultyToValue } from '@/lib/serializers/menu';
import type {
  SerializedRecipe,
  SerializedRecipeWithRelations,
  SerializedUserRecipe,
  StructuredIngredient
} from '@/lib/serializers/recipeTypes';

/** Every column the recipe contract exposes. One select for all read paths. */
export const recipeSelect = {
  id: true,
  telegram_id: true,
  title: true,
  raw_content: true,
  categories: true,
  ingredients_list: true,
  instructions: true,
  difficulty: true,
  preparation_time: true,
  cooking_time: true,
  servings: true,
  image_url: true,
  is_parsed: true,
  parse_errors: true,
  status: true,
  is_verified: true,
  needs_review: true,
  created_at: true,
  updated_at: true
} as const;

/** Relations the single-recipe routes ship alongside the recipe itself. */
export const recipeWithRelationsSelect = {
  ...recipeSelect,
  user_recipes: { select: { user_id: true, is_favorite: true } },
  versions: {
    select: { id: true, version_num: true, created_at: true, change_description: true },
    orderBy: { version_num: 'desc' as const },
    take: 5
  }
} as const;

/** What {@link serializeRecipe} needs — satisfied by a full row too. */
export interface RecipeRow {
  id: number;
  telegram_id: number;
  title: string | null;
  raw_content: string;
  categories: string | null;
  ingredients_list: Prisma.JsonValue;
  instructions: string | null;
  difficulty: RecipeDifficulty | null;
  preparation_time: number | null;
  cooking_time: number | null;
  servings: number | null;
  image_url: string | null;
  is_parsed: boolean;
  parse_errors: string | null;
  status: string;
  is_verified: boolean;
  needs_review: boolean;
  created_at: Date;
  updated_at: Date | null;
}

interface VersionSummaryRow {
  id: number;
  version_num: number | null;
  created_at: Date;
  change_description: string | null;
}

export interface RecipeRelationsRow {
  user_recipes: SerializedUserRecipe[];
  versions: VersionSummaryRow[];
}

/** Splits a joined text column ("a, b" / "a||b") into trimmed, non-empty parts. */
function splitColumn(value: string | null, separator: string): string[] {
  if (!value) return [];
  return value.split(separator).map((part) => part.trim()).filter(Boolean);
}

/**
 * `ingredients_list` -> `StructuredIngredient[]`. The column is `Json?`, so a
 * row that predates the backfill (null, or anything but an array of objects)
 * yields `[]` and the UI falls back to `raw_content`.
 */
export function structuredIngredientsOf(value: Prisma.JsonValue): StructuredIngredient[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
  ) as unknown as StructuredIngredient[];
}

export function serializeRecipe(recipe: RecipeRow): SerializedRecipe {
  return {
    id: recipe.id,
    telegram_id: recipe.telegram_id,
    title: recipe.title,
    raw_content: recipe.raw_content,
    categories: splitColumn(recipe.categories, ','),
    ingredients: structuredIngredientsOf(recipe.ingredients_list),
    instructions: recipe.instructions,
    difficulty: difficultyToValue(recipe.difficulty),
    preparation_time: recipe.preparation_time,
    cooking_time: recipe.cooking_time,
    servings: recipe.servings,
    image_url: recipe.image_url,
    is_parsed: recipe.is_parsed,
    // `recipeFieldsFromParsed` writes this column `||`-joined.
    parse_errors: splitColumn(recipe.parse_errors, '||'),
    status: recipe.status,
    is_verified: recipe.is_verified,
    // An old-channel edit overwrote an app edit (channel wins) — surfaced
    // as a conflict badge in /manage until the next app edit clears it.
    needs_review: recipe.needs_review,
    created_at: recipe.created_at.toISOString(),
    updated_at: recipe.updated_at ? recipe.updated_at.toISOString() : null
  };
}

export function serializeRecipeWithRelations(
  recipe: RecipeRow & RecipeRelationsRow
): SerializedRecipeWithRelations {
  return {
    ...serializeRecipe(recipe),
    user_recipes: recipe.user_recipes,
    versions: recipe.versions.map((version) => ({
      id: version.id,
      version_num: version.version_num,
      created_at: version.created_at.toISOString(),
      change_description: version.change_description
    }))
  };
}

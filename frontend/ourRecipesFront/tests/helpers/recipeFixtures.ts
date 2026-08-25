/**
 * A Prisma `Recipe` row shaped like `recipeSelect` (src/lib/serializers/recipe.ts).
 *
 * Every recipe route now answers through `serializeRecipe`, so a mocked row
 * has to carry the whole projection — a fixture missing `created_at` makes the
 * route 500 rather than fail an assertion. Tests override only what they mean
 * to assert on.
 */
export function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    telegram_id: 555,
    title: 'עוגת שוקולד',
    raw_content: 'כותרת: עוגת שוקולד',
    categories: null,
    ingredients_list: null,
    instructions: null,
    difficulty: null,
    preparation_time: null,
    cooking_time: null,
    servings: null,
    image_url: null,
    is_parsed: false,
    parse_errors: null,
    status: 'ACTIVE',
    sync_status: 'synced',
    sync_error: null,
    is_verified: false,
    created_at: new Date('2024-01-01T10:00:00Z'),
    updated_at: new Date('2024-01-01T10:00:00Z'),
    ...overrides
  };
}

/** The same row as the single-recipe routes select it (`recipeWithRelationsSelect`). */
export function recipeRowWithRelations(overrides: Record<string, unknown> = {}) {
  return { user_recipes: [], versions: [], ...recipeRow(overrides) };
}

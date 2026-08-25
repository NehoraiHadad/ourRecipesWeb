/**
 * Menu/Place response serializers.
 *
 * Ports `Menu.to_dict` / `MenuMeal.to_dict` / `MealRecipe.to_dict` from
 * `backend/ourRecipesBack/models/menu.py` field-for-field — the UI (see
 * `src/services/menuService.ts`, `src/types/index.ts`) expects these exact
 * keys, and enum-like columns as the same lowercase strings Flask emitted
 * (`DietaryType.MEAT.value === 'meat'`, `RecipeDifficulty.EASY.value ===
 * 'easy'`) even though Postgres stores the uppercase Prisma enum member.
 */
import { randomBytes } from 'node:crypto';
import type { DietaryType, MealRecipe, Menu, MenuMeal, RecipeDifficulty } from '@prisma/client';

/**
 * Columns every embedded recipe summary carries. `telegram_id` is not
 * decoration: it is the key `GET /api/recipes/[telegram_id]` looks up by, so
 * without it the UI cannot open a recipe it found inside a menu.
 */
export const recipeSummarySelect = {
  id: true,
  telegram_id: true,
  title: true,
  cooking_time: true,
  preparation_time: true,
  difficulty: true,
  servings: true,
  image_url: true
} as const;

/** Prisma `include` shape for a menu with its full meal/recipe tree, sorted like Flask's `lazy='joined', order_by=...`. */
export const menuMealsInclude = {
  meals: {
    orderBy: { meal_order: 'asc' as const },
    include: {
      recipes: {
        orderBy: { course_order: 'asc' as const },
        include: {
          recipe: {
            select: recipeSummarySelect
          }
        }
      }
    }
  }
};

export interface RecipeSummaryRow {
  id: number;
  telegram_id: number | null;
  title: string | null;
  cooking_time: number | null;
  preparation_time: number | null;
  difficulty: RecipeDifficulty | null;
  servings: number | null;
  image_url: string | null;
}

export interface MealRecipeRow extends MealRecipe {
  recipe?: RecipeSummaryRow | null;
}

export interface MealRow extends MenuMeal {
  recipes?: MealRecipeRow[];
}

export interface MenuRow extends Menu {
  meals?: MealRow[];
}

/** `secrets.token_urlsafe(24)` equivalent — 24 random bytes, base64url-encoded. */
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url');
}

/** `DietaryType.value` — the lowercase string the UI's `DietaryType` union expects. */
export function dietaryTypeToValue(dt: DietaryType | null | undefined): 'meat' | 'dairy' | 'pareve' | null {
  if (!dt) return null;
  return dt.toLowerCase() as 'meat' | 'dairy' | 'pareve';
}

/** Inverse of {@link dietaryTypeToValue} — parses a request body's `dietary_type` into the Prisma enum. */
export function parseDietaryType(input: unknown): DietaryType | undefined {
  if (typeof input !== 'string' || !input) return undefined;
  const upper = input.toUpperCase();
  if (upper === 'MEAT' || upper === 'DAIRY' || upper === 'PAREVE') {
    return upper as DietaryType;
  }
  return undefined;
}

/** `RecipeDifficulty.value` — the lowercase string the UI expects. */
export function difficultyToValue(d: RecipeDifficulty | null | undefined): 'easy' | 'medium' | 'hard' | null {
  if (!d) return null;
  return d.toLowerCase() as 'easy' | 'medium' | 'hard';
}

export function serializeRecipeSummary(recipe: RecipeSummaryRow) {
  return {
    id: recipe.id,
    telegram_id: recipe.telegram_id,
    title: recipe.title,
    cooking_time: recipe.cooking_time,
    preparation_time: recipe.preparation_time,
    difficulty: difficultyToValue(recipe.difficulty),
    servings: recipe.servings,
    image_url: recipe.image_url
  };
}

export function serializeMealRecipe(mealRecipe: MealRecipeRow, includeRecipeDetails = true) {
  const data: Record<string, unknown> = {
    id: mealRecipe.id,
    menu_meal_id: mealRecipe.menu_meal_id,
    recipe_id: mealRecipe.recipe_id,
    course_type: mealRecipe.course_type,
    course_order: mealRecipe.course_order,
    servings: mealRecipe.servings,
    notes: mealRecipe.notes,
    ai_reason: mealRecipe.ai_reason,
    created_at: mealRecipe.created_at ? mealRecipe.created_at.toISOString() : null
  };

  if (includeRecipeDetails && mealRecipe.recipe) {
    data.recipe = serializeRecipeSummary(mealRecipe.recipe);
  }

  return data;
}

export function serializeMeal(meal: MealRow, includeRecipes = true) {
  const data: Record<string, unknown> = {
    id: meal.id,
    menu_id: meal.menu_id,
    meal_type: meal.meal_type,
    meal_order: meal.meal_order,
    meal_time: meal.meal_time,
    notes: meal.notes,
    created_at: meal.created_at ? meal.created_at.toISOString() : null
  };

  if (includeRecipes) {
    data.recipes = (meal.recipes ?? []).map((r) => serializeMealRecipe(r));
  }

  return data;
}

export function serializeMenu(menu: MenuRow, includeMeals = true) {
  const data: Record<string, unknown> = {
    id: menu.id,
    user_id: menu.user_id,
    name: menu.name,
    event_type: menu.event_type,
    description: menu.description,
    total_servings: menu.total_servings,
    dietary_type: dietaryTypeToValue(menu.dietary_type),
    is_public: menu.is_public,
    share_token: menu.share_token,
    ai_reasoning: menu.ai_reasoning,
    created_at: menu.created_at ? menu.created_at.toISOString() : null,
    updated_at: menu.updated_at ? menu.updated_at.toISOString() : null
  };

  if (includeMeals) {
    data.meals = (menu.meals ?? []).map((m) => serializeMeal(m));
  }

  return data;
}

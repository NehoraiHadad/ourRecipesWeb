/**
 * Menu planning agent — public entry point.
 *
 * `generateMenuPreview` keeps the name and signature the old
 * `src/lib/services/menuPlannerService.ts` exported (that file is gone; this
 * is its replacement), so `POST /api/menus/generate-preview` only changed its
 * import. What changed underneath: real tools instead of a catalog dump, a
 * loop that dispatches every tool call, a self-review step, and a typed plan
 * from a response schema instead of a regex over prose.
 */
import { logger } from '@/lib/logger';
import { runMenuAgent } from './agent';
import { finalizeMenuPlan } from './finalize';
import type { MenuPlan, MenuPreferences } from './types';

export async function generateMenuPreview(preferences: MenuPreferences): Promise<MenuPlan> {
  logger.info(
    { name: preferences.name, mealTypes: preferences.meal_types, servings: preferences.servings },
    'Menu agent starting'
  );

  const { conclusion, iterations } = await runMenuAgent(preferences);
  const plan = await finalizeMenuPlan(preferences, conclusion);

  logger.info(
    {
      iterations,
      meals: plan.meals.length,
      recipes: plan.meals.reduce((total, meal) => total + meal.recipes.length, 0)
    },
    'Menu plan ready'
  );

  return plan;
}

export { MenuPlanFormatError } from './finalize';
export type { MealPlan, MenuPlan, MenuPreferences, PlannedRecipe } from './types';

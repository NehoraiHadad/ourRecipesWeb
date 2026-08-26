/**
 * Turn the planner agent's `MenuPlan` into the `MenuPreview` the UI renders.
 *
 * The agent speaks in bare recipe ids — that is all it needs to reason and all
 * the save route consumes. The UI, however, renders a preview exactly like a
 * saved menu: dish title, photo, timings. Saved menus get those from Prisma
 * (`menuMealsInclude`); the preview never touched the DB, so this module is
 * the missing half — one query, the same recipe columns, the same client type.
 *
 * Keeping the conversion here (rather than letting the agent's shape reach the
 * client) is what stops the two trees from drifting apart again: `MenuPlan` is
 * internal to the agent, `MenuPreview` is the wire contract.
 */
import { prisma } from '@/lib/prisma';
import { recipeSummarySelect, difficultyToValue, type RecipeSummaryRow } from '@/lib/serializers/menu';
import { logger } from '@/lib/logger';
import type { MenuPlan } from '@/lib/ai/menu/types';
import type { MenuPreview, RecipeSummary } from '@/types';

/** DB row → client summary. The row's nullable columns become optional fields. */
function toRecipeSummary(row: RecipeSummaryRow): RecipeSummary {
  return {
    id: row.id,
    telegram_id: row.telegram_id ?? undefined,
    title: row.title ?? '',
    difficulty: difficultyToValue(row.difficulty) ?? undefined,
    cooking_time: row.cooking_time ?? undefined,
    preparation_time: row.preparation_time ?? undefined,
    servings: row.servings ?? undefined,
    image_url: row.image_url ?? undefined
  };
}

/**
 * A recipe id the agent invented has no row here; that course keeps its
 * `recipe` undefined, the UI says so honestly, and the save route skips it.
 */
export async function buildMenuPreview(plan: MenuPlan): Promise<MenuPreview> {
  // Array.from, not spread: the tsconfig target predates iterable spread.
  const ids = Array.from(new Set(plan.meals.flatMap((meal) => meal.recipes.map((r) => r.recipe_id))));
  const rows = await prisma.recipe.findMany({ where: { id: { in: ids } }, select: recipeSummarySelect });
  const summaries = new Map(rows.map((row) => [row.id, toRecipeSummary(row)]));

  const missing = ids.filter((id) => !summaries.has(id));
  if (missing.length > 0) {
    logger.warn({ missing }, 'Menu plan references recipe ids with no matching row');
  }

  return {
    ai_reasoning: plan.reasoning,
    meals: plan.meals.map((meal) => ({
      meal_type: meal.meal_type,
      meal_order: meal.meal_order,
      recipes: meal.recipes.map((course) => ({
        recipe_id: course.recipe_id,
        course_type: course.course_type,
        course_order: course.course_order,
        ai_reason: course.ai_reason,
        recipe: summaries.get(course.recipe_id)
      }))
    }))
  };
}

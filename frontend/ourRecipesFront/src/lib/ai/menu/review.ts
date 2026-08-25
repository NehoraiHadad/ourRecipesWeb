/**
 * `review_menu_draft` — deterministic criticism of a draft menu.
 *
 * This is what makes the planner an agent rather than a one-shot prompt: the
 * model proposes, gets concrete Hebrew findings back, and revises. Everything
 * checked here is a fact about the database or about set overlap, never a
 * second opinion from a model.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { structuredIngredientsOf } from '@/lib/serializers/recipe';
import { PLANNABLE_RECIPE } from './filters';
import type { DraftMeal, ReviewMenuDraftArgs, ReviewResult } from './types';

/** A course whose name contains this counts as the main course. */
const MAIN_COURSE = /עיקר|main/i;

/** Shared by half the database; overlap here says nothing about the menu. */
const PANTRY_STAPLES = new Set([
  'מלח',
  'פלפל',
  'פלפל שחור',
  'סוכר',
  'מים',
  'שמן',
  'שמן זית',
  'קמח',
  'שום',
  'בצל'
]);

interface DraftEntry {
  mealType: string;
  recipeId: number;
  courseType: string;
}

function flatten(meals: DraftMeal[]): DraftEntry[] {
  const entries: DraftEntry[] = [];
  for (const meal of meals) {
    for (const recipe of meal.recipes ?? []) {
      if (typeof recipe.recipe_id !== 'number') continue;
      entries.push({
        mealType: meal.meal_type ?? 'ארוחה',
        recipeId: recipe.recipe_id,
        courseType: recipe.course_type ?? ''
      });
    }
  }
  return entries;
}

function checkDuplicates(entries: DraftEntry[], titles: Map<number, string>): string[] {
  const seen = new Map<number, number>();
  entries.forEach((entry) => seen.set(entry.recipeId, (seen.get(entry.recipeId) ?? 0) + 1));

  const issues: string[] = [];
  seen.forEach((count, id) => {
    if (count > 1) issues.push(`המתכון "${titles.get(id) ?? id}" מופיע יותר מפעם אחת בתפריט`);
  });
  return issues;
}

function checkMainCourses(meals: DraftMeal[]): string[] {
  return meals
    .filter((meal) => !(meal.recipes ?? []).some((r) => MAIN_COURSE.test(r.course_type ?? '')))
    .map((meal) => `בארוחה "${meal.meal_type ?? 'ארוחה'}" אין מנה עיקרית`);
}

/** Two courses in one meal built on the same non-staple ingredient read as repetitive. */
function checkIngredientOverlap(
  entries: DraftEntry[],
  ingredients: Map<number, string[]>
): string[] {
  const byMeal = new Map<string, DraftEntry[]>();
  entries.forEach((entry) => {
    byMeal.set(entry.mealType, (byMeal.get(entry.mealType) ?? []).concat(entry));
  });

  const issues: string[] = [];
  byMeal.forEach((mealEntries, mealType) => {
    const counts = new Map<string, number>();
    mealEntries.forEach((entry) => {
      // Per recipe, so one dish listing "עגבנייה" twice does not look like overlap.
      const unique = Array.from(new Set(ingredients.get(entry.recipeId) ?? []));
      unique.forEach((name) => {
        if (PANTRY_STAPLES.has(name)) return;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
    });

    const repeated: string[] = [];
    counts.forEach((count, name) => {
      if (count > 1) repeated.push(name);
    });
    if (repeated.length > 0) {
      issues.push(
        `בארוחה "${mealType}" יש חזרה על מרכיבים דומיננטיים: ${repeated.slice(0, 5).join(', ')}`
      );
    }
  });
  return issues;
}

export async function reviewMenuDraft(args: ReviewMenuDraftArgs): Promise<ReviewResult> {
  const meals = args.meals ?? [];
  const entries = flatten(meals);
  if (entries.length === 0) {
    return { ok: false, issues: ['הטיוטה ריקה — לא נבחרו מתכונים'] };
  }

  const rows = await prisma.recipe.findMany({
    where: { ...PLANNABLE_RECIPE, id: { in: Array.from(new Set(entries.map((e) => e.recipeId))) } },
    select: { id: true, title: true, ingredients_list: true }
  });

  const titles = new Map<number, string>();
  const ingredients = new Map<number, string[]>();
  rows.forEach((row) => {
    titles.set(row.id, row.title ?? String(row.id));
    ingredients.set(
      row.id,
      structuredIngredientsOf(row.ingredients_list)
        .map((ingredient) => ingredient.name?.trim())
        .filter((name): name is string => !!name)
    );
  });

  const issues = [
    ...entries
      .filter((entry) => !titles.has(entry.recipeId))
      .map((entry) => `המתכון ${entry.recipeId} לא קיים במאגר או אינו פעיל — יש להחליף אותו`),
    ...checkMainCourses(meals),
    ...checkDuplicates(entries, titles),
    ...checkIngredientOverlap(entries, ingredients)
  ];

  logger.debug({ meals: meals.length, issues: issues.length }, 'Menu agent: review_menu_draft');
  return { ok: issues.length === 0, issues };
}

/**
 * Executors for `search_recipes` and `get_recipes_details`, plus the dispatch
 * the agent loop calls. Every query is scoped to `status: 'ACTIVE'` and
 * `is_parsed: true` — the agent must never plan around a draft or deleted row.
 */
import type { RecipeDifficulty } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { structuredIngredientsOf } from '@/lib/serializers/recipe';
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_DETAIL_IDS,
  MAX_SEARCH_LIMIT
} from './declarations';
import { PLANNABLE_RECIPE } from '@/lib/recipes/visibility';
import { reviewMenuDraft } from './review';
import { buildSearchWhere } from './searchWhere';
import type {
  RecipeDetails,
  RecipeStub,
  ReviewMenuDraftArgs,
  SearchRecipesArgs
} from './types';

const INSTRUCTIONS_PREVIEW_CHARS = 200;

const STUB_SELECT = {
  id: true,
  title: true,
  categories: true,
  preparation_time: true,
  cooking_time: true,
  servings: true,
  difficulty: true
} as const;

function toStub(row: {
  id: number;
  title: string | null;
  categories: string | null;
  preparation_time: number | null;
  cooking_time: number | null;
  servings: number | null;
  difficulty: RecipeDifficulty | null;
}): RecipeStub {
  return { ...row, title: row.title ?? '', difficulty: row.difficulty ?? null };
}

function totalTime(row: { preparation_time: number | null; cooking_time: number | null }): number {
  return (row.preparation_time ?? 0) + (row.cooking_time ?? 0);
}

export async function searchRecipes(args: SearchRecipesArgs): Promise<RecipeStub[]> {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const capped = args.max_total_time ? Math.min(limit * 2, MAX_SEARCH_LIMIT * 2) : limit;

  const rows = await prisma.recipe.findMany({
    where: buildSearchWhere(args),
    select: STUB_SELECT,
    orderBy: { id: 'desc' },
    take: capped
  });

  const withinBudget = args.max_total_time
    ? rows.filter((row) => totalTime(row) <= (args.max_total_time as number))
    : rows;

  logger.debug({ matched: withinBudget.length, limit }, 'Menu agent: search_recipes');
  return withinBudget.slice(0, limit).map(toStub);
}

export async function getRecipesDetails(recipeIds: unknown): Promise<RecipeDetails[]> {
  const ids = (Array.isArray(recipeIds) ? recipeIds : [])
    .map((id) => (typeof id === 'number' ? id : Number(id)))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_DETAIL_IDS);

  if (ids.length === 0) return [];

  const rows = await prisma.recipe.findMany({
    where: { ...PLANNABLE_RECIPE, id: { in: ids } },
    select: { ...STUB_SELECT, instructions: true, ingredients_list: true }
  });

  logger.debug({ requested: ids.length, found: rows.length }, 'Menu agent: get_recipes_details');

  return rows.map((row) => ({
    ...toStub(row),
    ingredients: structuredIngredientsOf(row.ingredients_list)
      .map((ingredient) => ingredient.name)
      .filter((name): name is string => typeof name === 'string' && name.trim() !== ''),
    instructions_preview: (row.instructions ?? '').slice(0, INSTRUCTIONS_PREVIEW_CHARS)
  }));
}

/** Dispatch a model function call. Unknown names are the model's mistake, not a crash. */
export async function executeMenuTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'search_recipes':
      return { recipes: await searchRecipes(args as SearchRecipesArgs) };
    case 'get_recipes_details':
      return { recipes: await getRecipesDetails(args.recipe_ids) };
    case 'review_menu_draft':
      return { ...(await reviewMenuDraft(args as ReviewMenuDraftArgs)) };
    default:
      return { error: `כלי לא מוכר: ${name}` };
  }
}

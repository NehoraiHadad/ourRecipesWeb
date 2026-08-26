/**
 * Translate `search_recipes` arguments into a Prisma `where`.
 *
 * The point of the rewrite: filtering happens in SQL, so the agent gets a
 * dozen relevant rows per call instead of a 200-row catalog it has to read
 * with its context window.
 */
import type { Prisma, RecipeDifficulty } from '@prisma/client';
import { PLANNABLE_RECIPE } from '@/lib/recipes/visibility';
import type { SearchRecipesArgs } from './types';

const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
/** More terms than this and the AND-ed clauses match nothing useful. */
const MAX_QUERY_TERMS = 5;

/** Title OR categories `contains`, one clause per word, AND-ed together. */
function queryClauses(query: string): Prisma.RecipeWhereInput[] {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, MAX_QUERY_TERMS)
    .map((term) => ({
      OR: [
        { title: { contains: term, mode: 'insensitive' as const } },
        { categories: { contains: term, mode: 'insensitive' as const } }
      ]
    }));
}

export function buildSearchWhere(args: SearchRecipesArgs): Prisma.RecipeWhereInput {
  const and: Prisma.RecipeWhereInput[] = [];

  if (args.query) and.push(...queryClauses(args.query));

  const categories = (args.categories ?? []).filter((name) => name.trim().length > 0);
  if (categories.length > 0) {
    and.push({
      OR: categories.map((name) => ({
        categories: { contains: name, mode: 'insensitive' as const }
      }))
    });
  }

  const difficulty = args.difficulty?.toUpperCase();
  if (difficulty && DIFFICULTIES.has(difficulty)) {
    and.push({ difficulty: difficulty as RecipeDifficulty });
  }

  // Neither column alone may exceed the budget. The exact sum is re-checked in
  // JS by `searchRecipes`, since Prisma cannot compare a column sum in `where`.
  if (typeof args.max_total_time === 'number' && args.max_total_time > 0) {
    const lte = args.max_total_time;
    and.push({ OR: [{ preparation_time: { lte } }, { preparation_time: null }] });
    and.push({ OR: [{ cooking_time: { lte } }, { cooking_time: null }] });
  }

  return and.length > 0 ? { ...PLANNABLE_RECIPE, AND: and } : { ...PLANNABLE_RECIPE };
}

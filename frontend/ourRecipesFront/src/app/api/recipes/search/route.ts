/**
 * GET /api/recipes/search
 * Search recipes with the full set of advanced filters the UI offers.
 *
 * ## Query contract
 *
 * | param          | type                  | semantics                                                              |
 * | -------------- | --------------------- | ---------------------------------------------------------------------- |
 * | `query`        | string                | free text; matches title OR raw_content (insensitive)                    |
 * | `categories`   | comma-separated list  | recipe must carry **every** listed category (AND)                        |
 * | `category`     | string                | legacy single-category alias, folded into `categories`                   |
 * | `maxPrepTime`  | integer (minutes)     | `preparation_time <= maxPrepTime`                                        |
 * | `prepTime`     | integer (minutes)     | legacy alias of `maxPrepTime` (the Flask param name)                     |
 * | `difficulty`   | EASY \| MEDIUM \| HARD | case-insensitive; an unknown value is ignored                           |
 * | `includeTerms` | comma-separated list  | **every** term must appear in title OR raw_content (insensitive)         |
 * | `excludeTerms` | comma-separated list  | **no** term may appear in title OR raw_content (insensitive)             |
 * | `page`         | integer               | 1-based page number (default 1)                                          |
 * | `pageSize`     | integer               | page size, 1..100 (default 20)                                           |
 *
 * ### Why categories are ANDed
 * `Recipe.categories` is a single comma-separated text column, so a category
 * filter is a `contains` probe. The original Flask implementation
 * (`RecipeService.search_recipes`, see git history) chained one `ilike` filter
 * per selected category, i.e. a recipe had to carry **all** of them; the UI
 * mirrors that by rendering the selected chips as a single cumulative filter
 * count ("נקה הכל" clears the whole set) rather than as alternatives. We keep
 * those semantics: narrowing chips narrow the result set.
 *
 * The `where` clause is a flat `AND` of small `OR` groups so Postgres can plan
 * it in one pass — no post-filtering in JS.
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recipeSelect, serializeRecipe } from '@/lib/serializers/recipe';
import {
  paginatedResponse
} from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

const VALID_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
type RecipeDifficulty = typeof VALID_DIFFICULTIES[number];

/** Split a `a,b,c` query param into trimmed, non-empty terms. */
function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/** Parse a positive integer query param, ignoring junk. */
function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** `term` appears in the title or anywhere in the raw recipe text. */
function textMatch(term: string): Prisma.RecipeWhereInput {
  return {
    OR: [
      { title: { contains: term, mode: 'insensitive' } },
      { raw_content: { contains: term, mode: 'insensitive' } }
    ]
  };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const { searchParams } = url;

    // Extract search parameters
    const query = searchParams.get('query')?.trim() || '';
    // `category` (singular) is the legacy single-value param; both feed the
    // same AND-ed list so old links keep working.
    const categories = [
      ...parseList(searchParams.get('categories')),
      ...parseList(searchParams.get('category'))
    ];
    const rawDifficulty = searchParams.get('difficulty')?.trim().toUpperCase();
    const difficulty = rawDifficulty as RecipeDifficulty | undefined;
    const maxPrepTime =
      parsePositiveInt(searchParams.get('maxPrepTime')) ??
      parsePositiveInt(searchParams.get('prepTime'));
    const includeTerms = parseList(searchParams.get('includeTerms'));
    const excludeTerms = parseList(searchParams.get('excludeTerms'));

    // Pagination
    const { page, pageSize, skip, take } = parsePaginationParams(url);

    logger.debug(
      {
        query,
        categories,
        difficulty,
        maxPrepTime,
        includeTerms,
        excludeTerms,
        page,
        pageSize
      },
      'Searching recipes'
    );

    // Build where clause: AND of narrow OR-groups.
    const and: Prisma.RecipeWhereInput[] = [];

    // Text search (title or raw_content — raw_content already carries every
    // ingredient line, so a separate `ingredients` probe is redundant; that
    // column is dead per Stage B).
    if (query) {
      and.push(textMatch(query));
    }

    // Category filters — one `contains` probe per selected category (AND).
    for (const category of categories) {
      and.push({ categories: { contains: category, mode: 'insensitive' } });
    }

    // Preparation time upper bound (the UI offers 15/30/60/120 minutes).
    if (maxPrepTime !== null) {
      and.push({ preparation_time: { lte: maxPrepTime } });
    }

    // Terms that must appear, and terms that must not.
    for (const term of includeTerms) {
      and.push(textMatch(term));
    }
    for (const term of excludeTerms) {
      and.push({ NOT: textMatch(term) });
    }

    const where: Prisma.RecipeWhereInput = {
      status: 'ACTIVE', // Only active recipes
      // Difficulty filter (enum) — unknown values are ignored, as in Flask.
      ...(difficulty && VALID_DIFFICULTIES.includes(difficulty)
        ? { difficulty }
        : {}),
      ...(and.length > 0 ? { AND: and } : {})
    };

    // Get total count
    const totalItems = await prisma.recipe.count({ where });

    // The shared recipe contract (`recipeSelect`): the UI renders the recipe
    // body straight from the search results, so a summary-only projection
    // would leave the recipe modal empty.
    const recipes = await prisma.recipe.findMany({
      where,
      select: recipeSelect,
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: recipes.length, total: totalItems, query }, 'Search completed');

    return paginatedResponse(recipes.map(serializeRecipe), page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Recipe search failed');
    return handleApiError(error);
  }
}

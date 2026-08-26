/**
 * GET /api/recipes/manage
 * List all recipes for management (admin view)
 *
 * Returns paginated list of recipes with management fields.
 *
 * The deliberate exception to `lib/recipes/visibility.ts`: this is the one
 * route that may look past `VISIBLE_RECIPE`, because showing what was archived
 * is its whole purpose. It still defaults to `ACTIVE`.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recipeSelect, serializeRecipe } from '@/lib/serializers/recipe';
import { paginatedResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { RECIPE_STATUS_ACTIVE, RECIPE_STATUS_ARCHIVED } from '@/lib/recipes/visibility';

const VALID_STATUSES = [RECIPE_STATUS_ACTIVE, RECIPE_STATUS_ARCHIVED] as const;
type RecipeStatus = typeof VALID_STATUSES[number];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    // Optional filters
    const statusParam = searchParams.get('status');
    const status = (statusParam && VALID_STATUSES.includes(statusParam as RecipeStatus))
      ? statusParam as RecipeStatus
      : RECIPE_STATUS_ACTIVE;

    logger.debug({ status, skip, take }, 'Listing recipes for management');

    const where = {
      status
    };

    const totalItems = await prisma.recipe.count({ where });

    const recipes = await prisma.recipe.findMany({
      where,
      // The shared recipe contract (`recipeSelect`) — it already carries
      // everything the card previews (`RecipeList`/`RecipeGrid`) render:
      // ingredient/instruction/raw_content snippets, the difficulty and
      // prep-time badges, and the `parse_errors` the "with errors" /
      // "no errors" filters key on. (`created_by` does not exist in the new
      // schema — that badge stays hidden.)
      select: recipeSelect,
      orderBy: {
        updated_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: recipes.length, total: totalItems, status }, 'Management list fetched');

    return paginatedResponse(recipes.map(serializeRecipe), page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Management list failed');
    return handleApiError(error);
  }
}

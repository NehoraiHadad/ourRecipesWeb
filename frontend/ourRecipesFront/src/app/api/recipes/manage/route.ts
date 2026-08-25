/**
 * GET /api/recipes/manage
 * List all recipes for management (admin view)
 *
 * Returns paginated list of recipes with management fields
 * Optional status filter (active, archived, deleted)
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginatedResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

const VALID_STATUSES = ['ACTIVE', 'ARCHIVED', 'DELETED'] as const;
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
      : 'ACTIVE' as const;

    logger.debug({ status, skip, take }, 'Listing recipes for management');

    const where = {
      status
    };

    const totalItems = await prisma.recipe.count({ where });

    const recipes = await prisma.recipe.findMany({
      where,
      // Flask's `get_recipes_for_management` returned full rows; the card
      // previews (`RecipeList`/`RecipeGrid`) render ingredients/instructions/
      // raw_content snippets and difficulty/prep-time badges. (`created_by`
      // does not exist in the new schema — that badge stays hidden.)
      select: {
        id: true,
        telegram_id: true,
        title: true,
        raw_content: true,
        ingredients: true,
        instructions: true,
        categories: true,
        difficulty: true,
        preparation_time: true,
        cooking_time: true,
        servings: true,
        is_parsed: true,
        // The management screen's "with errors"/"no errors" filters and the
        // per-row error badge read this column (`RecipeManagement`, `RecipeList`).
        parse_errors: true,
        is_verified: true,
        sync_status: true,
        created_at: true,
        updated_at: true,
        image_url: true,
        status: true
      },
      orderBy: {
        updated_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: recipes.length, total: totalItems, status }, 'Management list fetched');

    return paginatedResponse(recipes, page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Management list failed');
    return handleApiError(error);
  }
}

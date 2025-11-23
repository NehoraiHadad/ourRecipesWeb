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
import { RecipeStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    // Optional filters
    const statusParam = searchParams.get('status');
    const status = (statusParam && Object.values(RecipeStatus).includes(statusParam as RecipeStatus))
      ? statusParam as RecipeStatus
      : RecipeStatus.ACTIVE;

    logger.debug({ status, skip, take }, 'Listing recipes for management');

    const where = {
      status
    };

    const totalItems = await prisma.recipe.count({ where });

    const recipes = await prisma.recipe.findMany({
      where,
      select: {
        id: true,
        telegram_id: true,
        title: true,
        categories: true,
        is_parsed: true,
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

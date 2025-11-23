/**
 * GET /api/recipes/search/suggestions
 * Autocomplete suggestions for recipe search
 *
 * Returns up to 10 matching recipe titles for autocomplete
 * Requires minimum 2 characters to search
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';

    if (query.length < 2) {
      // Don't search for single character (performance)
      logger.debug({ query }, 'Query too short for suggestions');
      return successResponse([]);
    }

    logger.debug({ query }, 'Getting autocomplete suggestions');

    // Get top 10 matching titles
    const suggestions = await prisma.recipe.findMany({
      where: {
        status: 'ACTIVE',
        title: {
          contains: query,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        title: true,
        telegram_id: true,
        image_url: true
      },
      take: 10,
      orderBy: {
        created_at: 'desc'
      }
    });

    logger.debug({ count: suggestions.length, query }, 'Suggestions found');

    return successResponse(suggestions);
  } catch (error) {
    logger.error({ error }, 'Autocomplete failed');
    return handleApiError(error);
  }
}

/**
 * GET /api/recipes/:telegram_id
 * Get single recipe by telegram_id
 *
 * Returns full recipe with relations (user_recipes, versions)
 * Uses telegram_id for compatibility with Flask API
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, NotFoundError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const telegramId = validateId(params.telegram_id);

    logger.debug({ telegramId }, 'Fetching recipe');

    const recipe = await prisma.recipe.findUnique({
      where: {
        telegram_id: telegramId
      },
      include: {
        user_recipes: {
          select: {
            user_id: true,
            is_favorite: true
          }
        },
        versions: {
          select: {
            id: true,
            version_num: true,
            created_at: true,
            change_description: true
          },
          orderBy: {
            version_num: 'desc'
          },
          take: 5 // Latest 5 versions
        }
      }
    });

    if (!recipe) {
      logger.warn({ telegramId }, 'Recipe not found');
      throw NotFoundError('Recipe not found');
    }

    logger.info({ recipeId: recipe.id, telegramId }, 'Recipe fetched');

    return successResponse(recipe);
  } catch (error) {
    return handleApiError(error);
  }
}

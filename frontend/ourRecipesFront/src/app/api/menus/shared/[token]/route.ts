/**
 * GET /api/menus/shared/:token
 * Get shared menu by token (no authentication required)
 *
 * Returns menu only if it's public and matches the share token
 * This endpoint is publicly accessible for sharing menus
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, NotFoundError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const shareToken = params.token;

    logger.debug({ shareToken }, 'Fetching shared menu');

    // Get menu by share token (must be public)
    const menu = await prisma.menu.findFirst({
      where: {
        share_token: shareToken,
        is_public: true  // Only public menus can be shared
      },
      include: {
        meals: {
          include: {
            recipes: {
              include: {
                recipe: {
                  select: {
                    id: true,
                    telegram_id: true,
                    title: true,
                    ingredients: true,
                    instructions: true,
                    categories: true,
                    difficulty: true,
                    cooking_time: true,
                    preparation_time: true,
                    servings: true,
                    image_url: true
                  }
                }
              },
              orderBy: {
                course_order: 'asc'
              }
            }
          },
          orderBy: {
            meal_order: 'asc'
          }
        },
        shopping_list_items: {
          orderBy: [
            { category: 'asc' },
            { ingredient_name: 'asc' }
          ]
        }
      }
    });

    if (!menu) {
      logger.warn({ shareToken }, 'Shared menu not found');
      throw NotFoundError('Menu not found or not shared');
    }

    logger.info({ menuId: menu.id, shareToken }, 'Shared menu fetched');

    return successResponse(menu);
  } catch (error) {
    return handleApiError(error);
  }
}

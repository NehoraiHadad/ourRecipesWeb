/**
 * GET /api/menus/:id
 * Get single menu with full structure (meals + recipes + shopping list)
 *
 * Access control: Owner OR public menu
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError
} from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TODO: Get user from session in Phase 3
    const userId = 'system'; // Placeholder
    const menuId = validateId(params.id);

    logger.debug({ userId, menuId }, 'Fetching menu');

    // Get menu with full structure
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
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
                    image_url: true,
                    is_verified: true
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
      throw NotFoundError('Menu not found');
    }

    // TODO: Check access when auth is added:
    // if (menu.user_id !== userId && !menu.is_public) {
    //   throw ForbiddenError('Access denied');
    // }

    logger.info({ menuId, userId }, 'Menu fetched successfully');

    return successResponse(menu);
  } catch (error) {
    return handleApiError(error);
  }
}

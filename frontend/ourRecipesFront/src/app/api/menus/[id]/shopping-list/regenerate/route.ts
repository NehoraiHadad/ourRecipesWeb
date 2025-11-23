/**
 * POST /api/menus/:id/shopping-list/regenerate
 * Regenerate shopping list from menu's recipes
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError
} from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';
import { generateShoppingList } from '@/lib/services/shoppingListService';

interface RouteParams {
  params: { id: string };
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const menuId = parseInt(params.id);

    if (isNaN(menuId)) {
      throw new Error('Invalid menu ID');
    }

    logger.debug({ menuId }, 'Regenerating shopping list');

    // Verify menu exists
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: {
        id: true,
        user_id: true
      }
    });

    if (!menu) {
      throw NotFoundError('Menu not found');
    }

    // TODO (Phase 3): Add access control - only owner can regenerate

    // Delete existing shopping list
    await prisma.shoppingListItem.deleteMany({
      where: { menu_id: menuId }
    });

    // Generate new shopping list from recipes
    const shoppingList = await generateShoppingList(menuId);

    logger.info(
      { menuId, itemsCreated: Object.values(shoppingList).flat().length },
      'Shopping list regenerated'
    );

    return successResponse(shoppingList);
  } catch (error) {
    logger.error({ error }, 'Failed to regenerate shopping list');
    return handleApiError(error);
  }
}

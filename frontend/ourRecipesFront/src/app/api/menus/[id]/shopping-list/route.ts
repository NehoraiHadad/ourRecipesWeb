/**
 * GET /api/menus/:id/shopping-list
 * Get shopping list for a menu
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

interface RouteParams {
  params: { id: string };
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const menuId = parseInt(params.id);

    if (isNaN(menuId)) {
      throw new Error('Invalid menu ID');
    }

    logger.debug({ menuId }, 'Fetching shopping list');

    // Verify menu exists
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: {
        id: true,
        user_id: true,
        is_public: true
      }
    });

    if (!menu) {
      throw NotFoundError('Menu not found');
    }

    // TODO (Phase 3): Add access control - owner or public
    // For now, allow all access

    // Get shopping list items
    const items = await prisma.shoppingListItem.findMany({
      where: { menu_id: menuId },
      orderBy: [
        { category: 'asc' },
        { ingredient_name: 'asc' }
      ]
    });

    // Group by category
    const groupedByCategory: Record<string, any[]> = {};
    items.forEach(item => {
      const category = item.category || 'אחר';
      if (!groupedByCategory[category]) {
        groupedByCategory[category] = [];
      }
      groupedByCategory[category].push({
        id: item.id,
        ingredient_name: item.ingredient_name,
        quantity: item.quantity,
        is_checked: item.is_checked,
        notes: item.notes
      });
    });

    logger.info(
      { menuId, totalItems: items.length, categories: Object.keys(groupedByCategory).length },
      'Shopping list fetched'
    );

    return successResponse(groupedByCategory);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch shopping list');
    return handleApiError(error);
  }
}

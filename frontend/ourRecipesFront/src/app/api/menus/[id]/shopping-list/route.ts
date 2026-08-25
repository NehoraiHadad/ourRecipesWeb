/**
 * GET /api/menus/:id/shopping-list
 * Get shopping list for a menu, grouped by category.
 *
 * Access control: authenticated, and the menu must be the caller's own or
 * `is_public` — the same rule as `GET /api/menus/:id`, which already embeds
 * these very rows. A menu the caller may not read answers 404 "Menu not found"
 * (Flask answered 403, which confirmed the menu existed).
 *
 * The public share page (`/menus/shared/:token`) does **not** call this route:
 * it reads `shopping_list_items` off the `GET /api/menus/shared/:token`
 * payload, so requiring a session here costs it nothing.
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
import { requireAuth, authErrorResponse } from '@/lib/auth';

interface RouteParams {
  params: { id: string };
}

interface GroupedItem {
  id: number;
  ingredient_name: string;
  quantity: string | null;
  is_checked: boolean;
  notes: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);
    const userId = auth.session.sub;

    const menuId = validateId(params.id);

    logger.debug({ menuId, userId }, 'Fetching shopping list');

    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: {
        id: true,
        user_id: true,
        is_public: true
      }
    });

    // Owner or public; anything else is indistinguishable from a missing menu.
    if (!menu || (menu.user_id !== userId && !menu.is_public)) {
      throw NotFoundError('Menu not found');
    }

    // Get shopping list items
    const items = await prisma.shoppingListItem.findMany({
      where: { menu_id: menuId },
      orderBy: [
        { category: 'asc' },
        { ingredient_name: 'asc' }
      ]
    });

    // Group by category
    const groupedByCategory: Record<string, GroupedItem[]> = {};
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

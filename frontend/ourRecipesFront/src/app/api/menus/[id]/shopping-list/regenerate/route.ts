/**
 * POST /api/menus/:id/shopping-list/regenerate
 * Rebuild the shopping list from the menu's recipes.
 *
 * Access control: owner only — a public menu is readable by anyone but its
 * shopping list is only rewritable by the person who owns the menu (matches
 * Flask's `regenerate_shopping_list`, which answered 403 "Access denied").
 * A menu that does not exist still answers 404.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  ForbiddenError
} from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { generateShoppingList } from '@/lib/services/shoppingListService';

interface RouteParams {
  params: { id: string };
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);

    logger.debug({ menuId, userId: auth.session.sub }, 'Regenerating shopping list');

    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: {
        id: true,
        user_id: true
      }
    });

    if (!menu) throw NotFoundError('Menu not found');
    if (menu.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

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

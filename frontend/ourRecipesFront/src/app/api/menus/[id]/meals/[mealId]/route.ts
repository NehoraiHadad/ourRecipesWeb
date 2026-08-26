/**
 * DELETE /api/menus/:id/meals/:mealId
 * Delete a meal from a menu (cascades to its recipes). Owner only.
 * Port of `delete_meal` (`routes/menus.py`).
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { handleApiError, NotFoundError, ForbiddenError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { generateShoppingList } from '@/lib/services/shoppingListService';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; mealId: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);
    const mealId = validateId(params.mealId);

    const menu = await prisma.menu.findUnique({ where: { id: menuId }, select: { user_id: true } });
    if (!menu) throw NotFoundError('Menu not found');
    if (menu.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

    const meal = await prisma.menuMeal.findUnique({ where: { id: mealId }, select: { id: true, menu_id: true } });
    if (!meal || meal.menu_id !== menuId) throw NotFoundError('Meal not found');

    await prisma.menuMeal.delete({ where: { id: mealId } });

    // Regenerate shopping list (Flask's `generate_shopping_list` clears existing items first).
    await prisma.shoppingListItem.deleteMany({ where: { menu_id: menuId } });
    const shoppingList = await generateShoppingList(menuId);

    logger.info({ menuId, mealId }, 'Meal deleted from menu');

    return Response.json({ success: true, message: 'Meal deleted successfully', shopping_list: shoppingList });
  } catch (error) {
    logger.error({ error }, 'Error deleting meal from menu');
    return handleApiError(error);
  }
}

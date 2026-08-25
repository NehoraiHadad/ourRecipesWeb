/**
 * PUT /api/menus/:id/meals/:mealId/recipes/:recipeId
 * Replace a recipe in a meal. Owner only.
 * Port of `replace_recipe` (`routes/menus.py`).
 *
 * DELETE /api/menus/:id/meals/:mealId/recipes/:recipeId
 * Remove a recipe from a meal. Owner only.
 * Port of `delete_recipe_from_meal` (`routes/menus.py`).
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { generateShoppingList } from '@/lib/services/shoppingListService';
import {
  menuMealsInclude,
  recipeSummarySelect,
  serializeMealRecipe,
  type MenuRow
} from '@/lib/serializers/menu';
import { mirrorMenuUpdate } from '@/lib/telegram/menuMirror';

interface RouteParams {
  params: { id: string; mealId: string; recipeId: string };
}

async function assertOwner(menuId: number, userId: string) {
  const menu = await prisma.menu.findUnique({ where: { id: menuId }, select: { user_id: true } });
  if (!menu) throw NotFoundError('Menu not found');
  if (menu.user_id !== userId) throw ForbiddenError('Access denied');
}

async function mirrorAfterMutation(menuId: number): Promise<void> {
  const fullMenu = (await prisma.menu.findUniqueOrThrow({
    where: { id: menuId },
    include: menuMealsInclude
  })) as MenuRow;
  const lastSync = await mirrorMenuUpdate(fullMenu, fullMenu.telegram_message_id);
  if (lastSync) {
    await prisma.menu.update({ where: { id: menuId }, data: { last_sync: lastSync } });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);
    const mealId = validateId(params.mealId);
    const recipeId = validateId(params.recipeId);
    const body = (await request.json().catch(() => ({}))) as { new_recipe_id?: number };

    await assertOwner(menuId, auth.session.sub);

    const mealRecipe = await prisma.mealRecipe.findFirst({
      where: { menu_meal_id: mealId, recipe_id: recipeId }
    });
    if (!mealRecipe) throw NotFoundError('Recipe not found in meal');

    if (!body.new_recipe_id) throw BadRequestError('new_recipe_id is required');

    const updated = await prisma.mealRecipe.update({
      where: { id: mealRecipe.id },
      data: { recipe_id: body.new_recipe_id },
      include: { recipe: { select: recipeSummarySelect } }
    });

    // Regenerate shopping list (Flask's `generate_shopping_list` clears existing items first).
    await prisma.shoppingListItem.deleteMany({ where: { menu_id: menuId } });
    const shoppingList = await generateShoppingList(menuId);

    // Update in Telegram if the menu is synced (best-effort).
    await mirrorAfterMutation(menuId);

    logger.info({ menuId, mealId, oldRecipeId: recipeId, newRecipeId: body.new_recipe_id }, 'Recipe replaced in meal');

    return Response.json({
      success: true,
      meal_recipe: serializeMealRecipe(updated),
      shopping_list: shoppingList
    });
  } catch (error) {
    logger.error({ error }, 'Error replacing recipe');
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);
    const mealId = validateId(params.mealId);
    const recipeId = validateId(params.recipeId);

    await assertOwner(menuId, auth.session.sub);

    const mealRecipe = await prisma.mealRecipe.findFirst({
      where: { menu_meal_id: mealId, recipe_id: recipeId }
    });
    if (!mealRecipe) throw NotFoundError('Recipe not found in meal');

    await prisma.mealRecipe.delete({ where: { id: mealRecipe.id } });

    // Regenerate shopping list (Flask's `generate_shopping_list` clears existing items first).
    await prisma.shoppingListItem.deleteMany({ where: { menu_id: menuId } });
    const shoppingList = await generateShoppingList(menuId);

    // Update in Telegram if the menu is synced (best-effort).
    await mirrorAfterMutation(menuId);

    logger.info({ menuId, mealId, recipeId }, 'Recipe deleted from meal');

    return Response.json({
      success: true,
      message: 'Recipe deleted successfully',
      shopping_list: shoppingList
    });
  } catch (error) {
    logger.error({ error }, 'Error deleting recipe from meal');
    return handleApiError(error);
  }
}

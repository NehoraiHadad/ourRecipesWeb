/**
 * POST /api/menus/:id/meals/:mealId/recipes
 * Add a recipe to a meal. Owner only.
 * Port of `add_recipe_to_meal` (`routes/menus.py`).
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLANNABLE_RECIPE } from '@/lib/recipes/visibility';
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

interface AddRecipeBody {
  recipe_id?: number;
  course_type?: string;
  course_order?: number;
  notes?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; mealId: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);
    const mealId = validateId(params.mealId);
    const body = (await request.json().catch(() => ({}))) as AddRecipeBody;

    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: { user_id: true, total_servings: true }
    });
    if (!menu) throw NotFoundError('Menu not found');
    if (menu.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

    const meal = await prisma.menuMeal.findUnique({ where: { id: mealId }, select: { id: true, menu_id: true } });
    if (!meal || meal.menu_id !== menuId) throw NotFoundError('Meal not found');

    if (!body.recipe_id) throw BadRequestError('recipe_id is required');

    // Same gate as the preview and the menu save: only a plannable recipe may
    // enter a menu, whichever door it comes through.
    const recipe = await prisma.recipe.findFirst({
      where: { ...PLANNABLE_RECIPE, id: body.recipe_id },
      select: { id: true }
    });
    if (!recipe) throw NotFoundError('Recipe not found');

    let courseOrder = body.course_order;
    if (courseOrder === undefined || courseOrder === null) {
      const max = await prisma.mealRecipe.aggregate({
        where: { menu_meal_id: mealId },
        _max: { course_order: true }
      });
      courseOrder = (max._max.course_order ?? 0) + 1;
    }

    const mealRecipe = await prisma.mealRecipe.create({
      data: {
        menu_meal_id: mealId,
        recipe_id: body.recipe_id,
        course_type: body.course_type,
        course_order: courseOrder,
        servings: menu.total_servings,
        notes: body.notes
      },
      include: {
        recipe: { select: recipeSummarySelect }
      }
    });

    // Regenerate shopping list (Flask's `generate_shopping_list` clears existing items first).
    await prisma.shoppingListItem.deleteMany({ where: { menu_id: menuId } });
    const shoppingList = await generateShoppingList(menuId);

    // Update in Telegram if the menu is synced (best-effort).
    const fullMenu = (await prisma.menu.findUniqueOrThrow({
      where: { id: menuId },
      include: menuMealsInclude
    })) as MenuRow;
    const lastSync = await mirrorMenuUpdate(fullMenu, fullMenu.telegram_message_id);
    if (lastSync) {
      await prisma.menu.update({ where: { id: menuId }, data: { last_sync: lastSync } });
    }

    logger.info({ menuId, mealId, recipeId: body.recipe_id }, 'Recipe added to meal');

    return Response.json(
      { success: true, meal_recipe: serializeMealRecipe(mealRecipe), shopping_list: shoppingList },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ error }, 'Error adding recipe to meal');
    return handleApiError(error);
  }
}

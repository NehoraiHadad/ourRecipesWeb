/**
 * POST /api/menus/:id/meals
 * Add a new meal to a menu. Owner only.
 * Port of `add_meal_to_menu` (`routes/menus.py`).
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { serializeMeal } from '@/lib/serializers/menu';

interface AddMealBody {
  meal_type?: string;
  meal_time?: string;
  meal_order?: number;
  notes?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);
    const body = (await request.json().catch(() => ({}))) as AddMealBody;

    const menu = await prisma.menu.findUnique({ where: { id: menuId }, select: { user_id: true } });
    if (!menu) throw NotFoundError('Menu not found');
    if (menu.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

    if (!body.meal_type) throw BadRequestError('meal_type is required');

    let mealOrder = body.meal_order;
    if (mealOrder === undefined || mealOrder === null) {
      const max = await prisma.menuMeal.aggregate({
        where: { menu_id: menuId },
        _max: { meal_order: true }
      });
      mealOrder = (max._max.meal_order ?? 0) + 1;
    }

    const meal = await prisma.menuMeal.create({
      data: {
        menu_id: menuId,
        meal_type: body.meal_type,
        meal_order: mealOrder,
        meal_time: body.meal_time,
        notes: body.notes
      }
    });

    logger.info({ menuId, mealId: meal.id }, 'Meal added to menu');

    return Response.json({ success: true, meal: serializeMeal({ ...meal, recipes: [] }) }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error adding meal to menu');
    return handleApiError(error);
  }
}

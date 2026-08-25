/**
 * GET /api/menus/:id/meals/:mealId/recipes/:recipeId/suggestions
 * Alternative recipe suggestions for replacing a recipe in a meal.
 * Owner OR public menu.
 * Port of `get_recipe_suggestions` (`routes/menus.py`) +
 * `MenuPlannerService.suggest_recipe_replacement`.
 */
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { handleApiError, NotFoundError, ForbiddenError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { difficultyToValue } from '@/lib/serializers/menu';

interface RouteParams {
  params: { id: string; mealId: string; recipeId: string };
}

/** Port of `MenuPlannerService.suggest_recipe_replacement`'s `course_keywords`. */
const COURSE_KEYWORDS: Record<string, string[]> = {
  salad: ['סלט', 'ירקות'],
  soup: ['מרק'],
  appetizer: ['מנה ראשונה', 'פתיח'],
  main: ['בשר', 'עוף', 'דג', 'עיקרי'],
  side: ['תוספת', 'אורז', 'פסטה'],
  dessert: ['קינוח', 'עוגה', 'מתוק']
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);
    const mealId = validateId(params.mealId);
    const recipeId = validateId(params.recipeId);

    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: { id: true, user_id: true, is_public: true, dietary_type: true }
    });
    if (!menu) throw NotFoundError('Menu not found');
    if (menu.user_id !== auth.session.sub && !menu.is_public) throw ForbiddenError('Access denied');

    const mealRecipe = await prisma.mealRecipe.findFirst({
      where: { menu_meal_id: mealId, recipe_id: recipeId },
      select: { course_type: true }
    });
    if (!mealRecipe) throw NotFoundError('Recipe not found in meal');

    const conditions: Prisma.RecipeWhereInput[] = [];

    if (menu.dietary_type === 'MEAT') {
      conditions.push({
        OR: [
          { categories: { contains: 'בשר' } },
          { categories: { contains: 'עוף' } },
          { categories: { contains: 'דגים' } }
        ]
      });
    } else if (menu.dietary_type === 'DAIRY') {
      conditions.push({
        OR: [{ categories: { contains: 'חלבי' } }, { categories: { contains: 'גבינה' } }]
      });
    }

    const keywords = COURSE_KEYWORDS[mealRecipe.course_type ?? ''] ?? [];
    if (keywords.length > 0) {
      conditions.push({ OR: keywords.map((kw) => ({ categories: { contains: kw } })) });
    }

    const suggestions = await prisma.recipe.findMany({
      where: {
        status: 'ACTIVE',
        is_parsed: true,
        id: { not: recipeId },
        AND: conditions
      },
      select: {
        id: true,
        telegram_id: true,
        title: true,
        categories: true,
        difficulty: true,
        cooking_time: true,
        preparation_time: true,
        image_url: true
      },
      take: 10
    });

    return Response.json({
      suggestions: suggestions.map((r) => ({
        id: r.id,
        telegram_id: r.telegram_id,
        title: r.title,
        categories: r.categories,
        difficulty: difficultyToValue(r.difficulty),
        cooking_time: r.cooking_time,
        preparation_time: r.preparation_time,
        image_url: r.image_url
      }))
    });
  } catch (error) {
    logger.error({ error }, 'Error getting recipe suggestions');
    return handleApiError(error);
  }
}

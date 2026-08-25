/**
 * GET /api/menus
 * List the signed-in user's own menus (public and private), newest first.
 *
 * Access control: owner only. Flask's `get_user_menus` also folded in every
 * public menu from every other user, which — because guest menus are created
 * `is_public` — turned the personal list into a global feed and leaked other
 * people's menus into it. The scoped-to-owner filter is the stricter reading
 * and the one kept here; other people's public menus stay reachable through
 * their share link (`GET /api/menus/shared/:token`) and by id.
 *
 * POST /api/menus
 * Save a menu after the user confirms an AI-generated preview.
 * Port of `POST /menus/save` (`routes/menus.py::save_menu`) — see the
 * deviations note at the bottom of this file for the path decision.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  paginatedResponse
} from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { requireAuth, authErrorResponse, GUEST_ID_PREFIX } from '@/lib/auth';
import { generateShoppingList } from '@/lib/services/shoppingListService';
import {
  generateShareToken,
  menuMealsInclude,
  parseDietaryType,
  serializeMenu,
  type MenuRow
} from '@/lib/serializers/menu';
import { mirrorMenuCreate } from '@/lib/telegram/menuMirror';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);
    const userId = auth.session.sub;

    // Pagination
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    logger.debug({ userId, skip, take }, 'Fetching menus');

    // Owner-scoped: both the count and the page use the same filter, so the
    // pagination totals describe the user's own menus and nothing else.
    const where = { user_id: userId };

    const totalItems = await prisma.menu.count({ where });

    const menus = await prisma.menu.findMany({
      where,
      select: {
        id: true,
        user_id: true,
        name: true,
        event_type: true,
        description: true,
        total_servings: true,
        dietary_type: true,
        share_token: true,
        is_public: true,
        created_at: true,
        updated_at: true,
        telegram_message_id: true,
        // The list card renders `menu.meals.length` ("N ארוחות"), so the meals
        // themselves ship — but only their own columns, never the recipe tree.
        meals: {
          orderBy: { meal_order: 'asc' as const },
          select: {
            id: true,
            menu_id: true,
            meal_type: true,
            meal_order: true,
            meal_time: true,
            notes: true,
            created_at: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: menus.length, total: totalItems }, 'Menus fetched');

    return paginatedResponse(menus, page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Fetch menus failed');
    return handleApiError(error);
  }
}

interface SaveMenuRecipeInput {
  recipe_id?: number;
  course_type?: string;
  course_order?: number;
  reason?: string;
}

interface SaveMenuMealInput {
  meal_type?: string;
  meal_order?: number;
  meal_time?: string;
  recipes?: SaveMenuRecipeInput[];
}

interface SaveMenuBody {
  preview?: { meals?: SaveMenuMealInput[]; reasoning?: string };
  preferences?: {
    name?: string;
    event_type?: string;
    description?: string;
    servings?: number;
    dietary_type?: string;
  };
}

/**
 * Port of `save_menu` (`routes/menus.py`): create the menu + meals + recipes
 * (invalid recipe ids are skipped, not fatal — matches
 * `MenuPlannerService._create_menu_from_plan`), generate the shopping list,
 * then mirror to Telegram best-effort (ARCHITECTURE §4.3).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);
    const userId = auth.session.sub;

    const body = (await request.json().catch(() => null)) as SaveMenuBody | null;
    if (!body?.preview || !body?.preferences) {
      throw BadRequestError('Missing preview or preferences');
    }

    const menuPlan = body.preview;
    const preferences = body.preferences;

    logger.info({ userId, name: preferences.name }, 'Saving menu');

    // Guest users' menus are public by default; authenticated users' are private by default
    // (port of `_create_menu_from_plan`'s is_guest / is_public logic).
    const isPublic = userId.startsWith(GUEST_ID_PREFIX);

    const menuId = await prisma.$transaction(async (tx) => {
      const menu = await tx.menu.create({
        data: {
          user_id: userId,
          name: preferences.name || 'תפריט חדש',
          event_type: preferences.event_type,
          description: preferences.description,
          total_servings: preferences.servings ?? 4,
          dietary_type: parseDietaryType(preferences.dietary_type),
          is_public: isPublic,
          share_token: generateShareToken(),
          ai_reasoning: menuPlan.reasoning,
          generation_prompt: JSON.stringify(preferences)
        }
      });

      for (const mealData of menuPlan.meals ?? []) {
        if (!mealData.meal_type || mealData.meal_order === undefined) continue;

        const meal = await tx.menuMeal.create({
          data: {
            menu_id: menu.id,
            meal_type: mealData.meal_type,
            meal_order: mealData.meal_order,
            meal_time: mealData.meal_time
          }
        });

        for (const recipeData of mealData.recipes ?? []) {
          if (!recipeData.recipe_id) continue;

          const recipe = await tx.recipe.findUnique({
            where: { id: recipeData.recipe_id },
            select: { id: true, title: true }
          });
          if (!recipe) {
            logger.warn({ recipeId: recipeData.recipe_id }, 'Recipe not found in DB, skipping in menu save');
            continue;
          }

          await tx.mealRecipe.create({
            data: {
              menu_meal_id: meal.id,
              recipe_id: recipeData.recipe_id,
              course_type: recipeData.course_type,
              course_order: recipeData.course_order ?? 0,
              servings: preferences.servings,
              ai_reason: recipeData.reason
            }
          });
        }
      }

      return menu.id;
    });

    // Reload with the full meal/recipe tree (mirrors the Flask handler's post-commit `Menu.query.get`).
    let menu = (await prisma.menu.findUniqueOrThrow({
      where: { id: menuId },
      include: menuMealsInclude
    })) as MenuRow;

    const shoppingList = await generateShoppingList(menu.id);

    const mirrored = await mirrorMenuCreate(menu);
    if (mirrored) {
      menu = (await prisma.menu.update({
        where: { id: menu.id },
        data: { telegram_message_id: mirrored.telegram_message_id, last_sync: mirrored.last_sync },
        include: menuMealsInclude
      })) as MenuRow;
    }

    logger.info({ menuId: menu.id, telegramMirrored: !!mirrored }, 'Menu saved');

    return Response.json(
      { success: true, menu: serializeMenu(menu), shopping_list: shoppingList },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ error }, 'Failed to save menu');
    return handleApiError(error);
  }
}

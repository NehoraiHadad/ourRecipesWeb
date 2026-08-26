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
 * Serializes through the shared `serializeMenu`/`menuMealsInclude` (Stage H2)
 * — the same contract `POST` below and `GET /api/menus/[id]` answer with —
 * rather than a hand-written projection. The list card (`app/(main)/menus`)
 * only renders `menu.meals.length`, but shipping the full meal/recipe tree
 * keeps this one shape for every menu route instead of a second, thinner one.
 *
 * POST /api/menus
 * Save a menu after the user confirms an AI-generated preview.
 * Port of `POST /menus/save` (`routes/menus.py::save_menu`) — see the
 * deviations note at the bottom of this file for the path decision.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLANNABLE_RECIPE } from '@/lib/recipes/visibility';
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

    const menus = (await prisma.menu.findMany({
      where,
      include: menuMealsInclude,
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take
    })) as MenuRow[];

    logger.info({ count: menus.length, total: totalItems }, 'Menus fetched');

    return paginatedResponse(menus.map((menu) => serializeMenu(menu)), page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Fetch menus failed');
    return handleApiError(error);
  }
}

/**
 * The body the client posts: the untouched `MenuPlan` preview from
 * `POST /api/menus/generate-preview` plus the preferences it was generated
 * from. Every field is optional because it arrives from the network — the
 * handler skips what it cannot use.
 *
 * `ai_reason` is the field name across the whole chain (agent schema →
 * preview → here → `MealRecipe.ai_reason`). This route used to read `reason`,
 * which nothing ever produced, so every saved menu silently lost its
 * per-recipe explanations.
 */
interface SaveMenuRecipeInput {
  recipe_id?: number;
  course_type?: string;
  course_order?: number;
  ai_reason?: string;
}

interface SaveMenuMealInput {
  meal_type?: string;
  meal_order?: number;
  meal_time?: string;
  recipes?: SaveMenuRecipeInput[];
}

interface SaveMenuInput {
  /**
   * `ai_reasoning` is the canonical name (shared with the saved menu and the
   * `MenuPreview` wire type); `reasoning` is the pre-2026-08-26 preview field,
   * still accepted so a preview generated before a deploy can be saved after.
   */
  preview?: { meals?: SaveMenuMealInput[]; ai_reasoning?: string; reasoning?: string };
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
 * `MenuPlannerService._create_menu_from_plan`), then generate the shopping
 * list. The DB is the only store now that the main Telegram channel is gone.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);
    const userId = auth.session.sub;

    const body = (await request.json().catch(() => null)) as SaveMenuInput | null;
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
          ai_reasoning: menuPlan.ai_reasoning ?? menuPlan.reasoning,
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

          // Same gate as the preview (`buildMenuPreview`): a course may only be
          // saved if its recipe is still plannable. A stale preview held in the
          // browser must not resurrect a recipe deleted since it was generated.
          const recipe = await tx.recipe.findFirst({
            where: { ...PLANNABLE_RECIPE, id: recipeData.recipe_id },
            select: { id: true, title: true }
          });
          if (!recipe) {
            logger.warn(
              { recipeId: recipeData.recipe_id },
              'Recipe missing or no longer plannable, skipping in menu save'
            );
            continue;
          }

          await tx.mealRecipe.create({
            data: {
              menu_meal_id: meal.id,
              recipe_id: recipeData.recipe_id,
              course_type: recipeData.course_type,
              course_order: recipeData.course_order ?? 0,
              servings: preferences.servings,
              ai_reason: recipeData.ai_reason
            }
          });
        }
      }

      return menu.id;
    });

    // Reload with the full meal/recipe tree (mirrors the Flask handler's post-commit `Menu.query.get`).
    const menu = (await prisma.menu.findUniqueOrThrow({
      where: { id: menuId },
      include: menuMealsInclude
    })) as MenuRow;

    const shoppingList = await generateShoppingList(menu.id);

    logger.info({ menuId: menu.id }, 'Menu saved');

    return Response.json(
      { success: true, menu: serializeMenu(menu), shopping_list: shoppingList },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ error }, 'Failed to save menu');
    return handleApiError(error);
  }
}

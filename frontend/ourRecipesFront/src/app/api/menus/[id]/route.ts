/**
 * GET /api/menus/:id
 * Get single menu with full structure (meals + recipes + shopping list)
 *
 * Access control: Owner OR public menu
 * @note Authentication will be added in Phase 3
 *
 * PUT /api/menus/:id
 * Update menu name/description/is_public. Owner only.
 * Port of `update_menu` (`routes/menus.py`).
 *
 * DELETE /api/menus/:id
 * Delete a menu (cascades to meals/recipes/shopping list). Owner only.
 * Port of `delete_menu` (`routes/menus.py`) — deletes the mirrored Telegram
 * message first (best-effort), then the DB row (ARCHITECTURE §4.3/§4.4).
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
import { menuMealsInclude, serializeMenu, type MenuRow } from '@/lib/serializers/menu';
import { mirrorMenuDelete, mirrorMenuUpdate } from '@/lib/telegram/menuMirror';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TODO: Get user from session in Phase 3
    const userId = 'system'; // Placeholder
    const menuId = validateId(params.id);

    logger.debug({ userId, menuId }, 'Fetching menu');

    // Get menu with full structure
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      include: {
        meals: {
          include: {
            recipes: {
              include: {
                recipe: {
                  select: {
                    id: true,
                    telegram_id: true,
                    title: true,
                    ingredients: true,
                    instructions: true,
                    categories: true,
                    difficulty: true,
                    cooking_time: true,
                    preparation_time: true,
                    servings: true,
                    image_url: true,
                    is_verified: true
                  }
                }
              },
              orderBy: {
                course_order: 'asc'
              }
            }
          },
          orderBy: {
            meal_order: 'asc'
          }
        },
        shopping_list_items: {
          orderBy: [
            { category: 'asc' },
            { ingredient_name: 'asc' }
          ]
        }
      }
    });

    if (!menu) {
      throw NotFoundError('Menu not found');
    }

    // TODO: Check access when auth is added:
    // if (menu.user_id !== userId && !menu.is_public) {
    //   throw ForbiddenError('Access denied');
    // }

    logger.info({ menuId, userId }, 'Menu fetched successfully');

    return successResponse(menu);
  } catch (error) {
    return handleApiError(error);
  }
}

interface UpdateMenuBody {
  name?: string;
  description?: string;
  is_public?: boolean;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);
    const body = (await request.json().catch(() => ({}))) as UpdateMenuBody;

    const existing = await prisma.menu.findUnique({ where: { id: menuId }, select: { user_id: true } });
    if (!existing) throw NotFoundError('Menu not found');
    if (existing.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

    const data: Record<string, unknown> = {};
    if ('name' in body) data.name = body.name;
    if ('description' in body) data.description = body.description;
    if ('is_public' in body) data.is_public = body.is_public;

    await prisma.menu.update({ where: { id: menuId }, data });

    let menu = (await prisma.menu.findUniqueOrThrow({
      where: { id: menuId },
      include: menuMealsInclude
    })) as MenuRow;

    // Update in Telegram if the menu is synced (best-effort — DB update already succeeded).
    const lastSync = await mirrorMenuUpdate(menu, menu.telegram_message_id);
    if (lastSync) {
      menu = (await prisma.menu.update({
        where: { id: menuId },
        data: { last_sync: lastSync },
        include: menuMealsInclude
      })) as MenuRow;
    }

    logger.info({ menuId }, 'Menu updated');

    return Response.json({ success: true, menu: serializeMenu(menu) });
  } catch (error) {
    logger.error({ error }, 'Error updating menu');
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const menuId = validateId(params.id);

    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: { user_id: true, telegram_message_id: true }
    });
    if (!menu) throw NotFoundError('Menu not found');
    // Only the owner can delete — not public access (matches `delete_menu`).
    if (menu.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

    // Delete from Telegram first (best-effort), then the DB — DB delete always succeeds
    // regardless of the Telegram outcome (ARCHITECTURE §4.3/§4.4).
    await mirrorMenuDelete(menu.telegram_message_id);

    await prisma.menu.delete({ where: { id: menuId } });

    logger.info({ menuId }, 'Menu deleted');

    return Response.json({ success: true, message: 'Menu deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Error deleting menu');
    return handleApiError(error);
  }
}

/**
 * GET /api/menus/:id
 * Get single menu with full structure (meals + recipes + shopping list)
 *
 * Access control: authenticated, and the menu must be the caller's own or
 * `is_public`. Flask answered 403 "Access denied" for a private menu belonging
 * to someone else, which confirms the menu exists; this route answers with the
 * same 404 "Menu not found" it uses for a missing id, so a stranger cannot
 * probe which menu ids are real.
 *
 * PUT /api/menus/:id
 * Update menu name/description/is_public. Owner only.
 * Port of `update_menu` (`routes/menus.py`).
 *
 * DELETE /api/menus/:id
 * Delete a menu (cascades to meals/recipes/shopping list). Owner only.
 * Port of `delete_menu` (`routes/menus.py`). The DB is the only store now
 * that the main Telegram channel is gone, so this is a single DB delete.
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);
    const userId = auth.session.sub;
    const menuId = validateId(params.id);

    logger.debug({ userId, menuId }, 'Fetching menu');

    // Get menu with full structure
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      include: {
        ...menuMealsInclude,
        shopping_list_items: {
          orderBy: [
            { category: 'asc' },
            { ingredient_name: 'asc' }
          ]
        }
      }
    });

    // Someone else's private menu is indistinguishable from a missing one.
    if (!menu || (menu.user_id !== userId && !menu.is_public)) {
      throw NotFoundError('Menu not found');
    }

    logger.info({ menuId, userId }, 'Menu fetched successfully');

    // Serialized like PUT/POST — the UI expects Flask's lowercase enum values
    // (`dietary_type: 'meat'`, `recipe.difficulty: 'easy'`), not the raw
    // Prisma row's uppercase members.
    return successResponse({
      ...serializeMenu(menu as MenuRow),
      shopping_list_items: menu.shopping_list_items
    });
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

    const menu = (await prisma.menu.findUniqueOrThrow({
      where: { id: menuId },
      include: menuMealsInclude
    })) as MenuRow;

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
      select: { user_id: true }
    });
    if (!menu) throw NotFoundError('Menu not found');
    // Only the owner can delete — not public access (matches `delete_menu`).
    if (menu.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

    await prisma.menu.delete({ where: { id: menuId } });

    logger.info({ menuId }, 'Menu deleted');

    return Response.json({ success: true, message: 'Menu deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Error deleting menu');
    return handleApiError(error);
  }
}

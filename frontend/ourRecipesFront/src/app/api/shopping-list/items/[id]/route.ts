/**
 * PATCH /api/shopping-list/items/:id
 * Update shopping list item (check/uncheck)
 *
 * PUT /api/shopping-list/items/:id
 * Update full item details
 *
 * DELETE /api/shopping-list/items/:id
 * Delete item from shopping list
 *
 * Access control for all three: authenticated, and the item's parent menu must
 * belong to the caller. Flask's `update_shopping_item` had no check at all —
 * any signed-in user could tick off (or delete) anyone else's list. Ownership
 * lives on the menu, not the item, so every handler resolves
 * `item -> menu.user_id` first. A public menu is readable by others but its
 * items stay owner-only: sharing a menu must not hand out write access.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  ForbiddenError,
  BadRequestError
} from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import type { AuthFailure } from '@/lib/auth';

interface RouteParams {
  params: { id: string };
}

type ItemWithMenu = NonNullable<Awaited<ReturnType<typeof findItemWithMenu>>>;

function findItemWithMenu(itemId: number) {
  return prisma.shoppingListItem.findUnique({
    where: { id: itemId },
    include: { menu: { select: { user_id: true } } }
  });
}

/**
 * Resolves the item and asserts the caller owns its menu.
 *
 * Returns either the item (with its menu) or the auth failure to hand back —
 * `requireAuth`'s 401/403 body differs from `handleApiError`'s, so it is
 * returned rather than thrown. Ownership violations throw `ForbiddenError`,
 * matching the menu write routes.
 */
async function requireOwnedItem(
  request: NextRequest,
  params: RouteParams['params']
): Promise<{ ok: true; item: ItemWithMenu } | { ok: false; failure: AuthFailure }> {
  const auth = await requireAuth(request);
  if (!auth.ok) return { ok: false, failure: auth };

  const itemId = validateId(params.id);

  const item = await findItemWithMenu(itemId);
  if (!item) throw NotFoundError('Item not found');
  if (item.menu.user_id !== auth.session.sub) throw ForbiddenError('Access denied');

  return { ok: true, item };
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const body = await request.json().catch(() => ({}));

    const owned = await requireOwnedItem(request, params);
    if (!owned.ok) return authErrorResponse(owned.failure);
    const { item } = owned;

    if (typeof body.is_checked !== 'boolean') {
      throw BadRequestError('is_checked is required and must be boolean');
    }

    logger.debug({ itemId: item.id, is_checked: body.is_checked }, 'Updating item status');

    const updatedItem = await prisma.shoppingListItem.update({
      where: { id: item.id },
      data: {
        is_checked: body.is_checked
      }
    });

    logger.info({ itemId: item.id, is_checked: body.is_checked }, 'Item status updated');

    return successResponse(updatedItem);
  } catch (error) {
    logger.error({ error }, 'Failed to update item status');
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const body = await request.json().catch(() => ({}));

    const owned = await requireOwnedItem(request, params);
    if (!owned.ok) return authErrorResponse(owned.failure);
    const { item } = owned;

    logger.debug({ itemId: item.id }, 'Updating item details');

    const updatedItem = await prisma.shoppingListItem.update({
      where: { id: item.id },
      data: {
        ingredient_name: body.ingredient_name || item.ingredient_name,
        quantity: body.quantity !== undefined ? body.quantity : item.quantity,
        category: body.category !== undefined ? body.category : item.category,
        notes: body.notes !== undefined ? body.notes : item.notes,
        is_checked: body.is_checked !== undefined ? body.is_checked : item.is_checked
      }
    });

    logger.info({ itemId: item.id }, 'Item updated');

    return successResponse(updatedItem);
  } catch (error) {
    logger.error({ error }, 'Failed to update item');
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const owned = await requireOwnedItem(request, params);
    if (!owned.ok) return authErrorResponse(owned.failure);
    const { item } = owned;

    logger.debug({ itemId: item.id }, 'Deleting item');

    await prisma.shoppingListItem.delete({
      where: { id: item.id }
    });

    logger.info({ itemId: item.id }, 'Item deleted');

    return successResponse({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete item');
    return handleApiError(error);
  }
}

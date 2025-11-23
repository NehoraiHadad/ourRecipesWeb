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
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  BadRequestError
} from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: { id: string };
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const itemId = parseInt(params.id);

    if (isNaN(itemId)) {
      throw new Error('Invalid item ID');
    }

    const body = await request.json();

    if (typeof body.is_checked !== 'boolean') {
      throw BadRequestError('is_checked is required and must be boolean');
    }

    logger.debug({ itemId, is_checked: body.is_checked }, 'Updating item status');

    // Get item
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw NotFoundError('Item not found');
    }

    // TODO (Phase 3): Add access control - only menu owner can update

    // Update item
    const updatedItem = await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: {
        is_checked: body.is_checked
      }
    });

    logger.info({ itemId, is_checked: body.is_checked }, 'Item status updated');

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
    const itemId = parseInt(params.id);

    if (isNaN(itemId)) {
      throw new Error('Invalid item ID');
    }

    const body = await request.json();

    logger.debug({ itemId }, 'Updating item details');

    // Get item
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw NotFoundError('Item not found');
    }

    // TODO (Phase 3): Add access control - only menu owner can update

    // Update item
    const updatedItem = await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: {
        ingredient_name: body.ingredient_name || item.ingredient_name,
        quantity: body.quantity !== undefined ? body.quantity : item.quantity,
        category: body.category !== undefined ? body.category : item.category,
        notes: body.notes !== undefined ? body.notes : item.notes,
        is_checked: body.is_checked !== undefined ? body.is_checked : item.is_checked
      }
    });

    logger.info({ itemId }, 'Item updated');

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
    const itemId = parseInt(params.id);

    if (isNaN(itemId)) {
      throw new Error('Invalid item ID');
    }

    logger.debug({ itemId }, 'Deleting item');

    // Get item
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw NotFoundError('Item not found');
    }

    // TODO (Phase 3): Add access control - only menu owner can delete

    // Delete item
    await prisma.shoppingListItem.delete({
      where: { id: itemId }
    });

    logger.info({ itemId }, 'Item deleted');

    return successResponse({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete item');
    return handleApiError(error);
  }
}

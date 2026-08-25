/**
 * PUT /api/places/:id
 * Update a place. Any authenticated user may update any place — Flask's
 * `update_place` has no ownership check, ported as-is.
 * Port of `update_place` (`routes/places.py`).
 *
 * DELETE /api/places/:id
 * Soft delete (`is_deleted = true`); no ownership check either, matching
 * `delete_place` (`routes/places.py`).
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { handleApiError, BadRequestError, NotFoundError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { serializePlace } from '@/lib/serializers/place';
import { mirrorPlaceDelete, mirrorPlaceUpdate } from '@/lib/telegram/placeMirror';

interface RouteParams {
  params: { id: string };
}

interface UpdatePlaceBody {
  name?: string;
  website?: string;
  description?: string;
  location?: string;
  waze_link?: string;
  type?: string;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const placeId = validateId(params.id);
    const body = (await request.json().catch(() => null)) as UpdatePlaceBody | null;
    if (!body) throw BadRequestError('No data provided');

    const existing = await prisma.place.findUnique({ where: { id: placeId } });
    if (!existing) throw NotFoundError('Place not found');

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        name: 'name' in body ? body.name : existing.name,
        website: 'website' in body ? body.website : existing.website,
        description: 'description' in body ? body.description : existing.description,
        location: 'location' in body ? body.location : existing.location,
        waze_link: 'waze_link' in body ? body.waze_link : existing.waze_link,
        type: 'type' in body ? body.type : existing.type
      }
    });

    logger.info({ placeId }, 'Place updated');

    // Update the Telegram message if one exists (best-effort — DB update already succeeded).
    await mirrorPlaceUpdate(updated, updated.created_by, updated.telegram_message_id);

    return Response.json(serializePlace(updated));
  } catch (error) {
    logger.error({ error }, 'Error updating place');
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const placeId = validateId(params.id);
    const userName = auth.session.sub; // No display name in the session (see places/route.ts note).

    const existing = await prisma.place.findUnique({ where: { id: placeId } });
    if (!existing) throw NotFoundError('Place not found');

    const updated = await prisma.place.update({ where: { id: placeId }, data: { is_deleted: true } });

    // Mark the Telegram message as deleted (edit, not remove — Telegram convention for manual
    // deletes, ARCHITECTURE §4.4). Best-effort — DB update already succeeded.
    await mirrorPlaceDelete(updated, updated.created_by, userName, updated.telegram_message_id);

    logger.info({ placeId }, 'Place soft-deleted');

    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error({ error }, 'Error deleting place');
    return handleApiError(error);
  }
}

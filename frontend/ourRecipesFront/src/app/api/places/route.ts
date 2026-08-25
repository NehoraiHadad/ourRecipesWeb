/**
 * GET /api/places
 * List all non-deleted places, newest first.
 * Port of `get_places` (`routes/places.py`).
 *
 * POST /api/places
 * Create a place recommendation, mirrored to Telegram best-effort.
 * Port of `create_place` (`routes/places.py`).
 *
 * @note Flask reads a `user_name` set on login into the Flask session, which
 * our JWT session (`src/lib/auth/types.ts`) does not carry, so the
 * `session.get("user_name", user_id)` fallback always applies here — see the
 * deviations note in the Wave 1.C report.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';
import { serializePlace } from '@/lib/serializers/place';
import { mirrorPlaceCreate } from '@/lib/telegram/placeMirror';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const places = await prisma.place.findMany({
      where: { is_deleted: false },
      orderBy: { created_at: 'desc' }
    });

    return Response.json(places.map(serializePlace));
  } catch (error) {
    logger.error({ error }, 'Error getting places');
    return handleApiError(error);
  }
}

interface CreatePlaceBody {
  name?: string;
  website?: string;
  description?: string;
  location?: string;
  waze_link?: string;
  type?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const body = (await request.json().catch(() => null)) as CreatePlaceBody | null;
    if (!body) throw BadRequestError('No data provided');
    if (!body.name) throw BadRequestError('Place name is required');

    const userId = auth.session.sub;
    const userName = userId; // No display name in the session (see file header note).

    const place = await prisma.place.create({
      data: {
        name: body.name,
        website: body.website,
        description: body.description,
        location: body.location,
        waze_link: body.waze_link,
        type: body.type,
        created_by: `${userName} (${userId})`
      }
    });

    logger.info({ placeId: place.id }, 'Place created');

    // Backup to Telegram (best-effort — the place is already saved).
    const telegramMessageId = await mirrorPlaceCreate(place, userName);
    const finalPlace = telegramMessageId
      ? await prisma.place.update({ where: { id: place.id }, data: { telegram_message_id: telegramMessageId } })
      : place;

    return Response.json(serializePlace(finalPlace), { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error creating place');
    return handleApiError(error);
  }
}

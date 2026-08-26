/**
 * GET /api/places
 * List all non-deleted places, newest first.
 * Port of `get_places` (`routes/places.py`).
 *
 * POST /api/places
 * Create a place recommendation.
 * Port of `create_place` (`routes/places.py`).
 *
 * @note Flask read a `user_name` set on login into the Flask session. Our JWT
 * now carries the same display name as an optional `name` claim, so
 * `session.get("user_name", user_id)` maps to `session.name ?? session.sub` —
 * the `sub` fallback only applies to tokens minted before the claim existed.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VISIBLE_PLACE } from '@/lib/places/visibility';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';
import { serializePlace } from '@/lib/serializers/place';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const places = await prisma.place.findMany({
      where: VISIBLE_PLACE,
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
    const userName = auth.session.name ?? userId; // Flask's `session.get("user_name", user_id)`.

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

    return Response.json(serializePlace(place), { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error creating place');
    return handleApiError(error);
  }
}

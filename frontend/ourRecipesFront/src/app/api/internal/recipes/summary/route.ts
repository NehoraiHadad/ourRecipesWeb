/**
 * GET /api/internal/recipes/summary — what the reconcile job compares against.
 *
 * The Python function reads the last N old-channel messages and needs to
 * answer one question per message: *does a row already claim this
 * `source_message_id`?* There is no text comparison — the stored
 * `raw_content` is Gemini's reformat of the raw post, so it can never equal
 * the channel text; existence is the only signal (ARCHITECTURE §4.6).
 *
 * Auth: `Authorization: Bearer <INTERNAL_API_SECRET>`.
 *
 * Query parameters:
 *  - `source_ids` — required; comma-separated old-channel `message_id`s
 *    (max 500 per request).
 *
 * Response:
 * ```jsonc
 * {
 *   "ok": true,
 *   "count": 1,
 *   "recipes": [
 *     { "source_message_id": 12, "telegram_id": -900123, "status": "ACTIVE",
 *       "has_image": true, "updated_at": "2026-08-25T09:00:00.000Z" }
 *   ]
 * }
 * ```
 * Ids absent from `recipes` have no row — those are the reconcile's misses.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireInternalSecret } from '@/lib/internal/auth';
import { SOURCE_CHANNEL_OLD } from '@/lib/recipes/ingest';

export const dynamic = 'force-dynamic';

const log = logger.child({ context: 'api/internal/recipes/summary' });

const MAX_IDS = 500;

function parseSourceIds(raw: string | null): number[] | null {
  if (!raw) return null;

  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ids.slice(0, MAX_IDS);
}

export async function GET(request: NextRequest): Promise<Response> {
  const unauthorized = requireInternalSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);

    const sourceIds = parseSourceIds(searchParams.get('source_ids'));
    if (sourceIds === null) {
      return Response.json(
        { ok: false, error: 'source_ids is required (comma-separated old-channel message ids)' },
        { status: 400 }
      );
    }
    // Present but none valid: an explicit empty question, empty answer.
    if (sourceIds.length === 0) {
      return Response.json({ ok: true, count: 0, recipes: [] });
    }

    const recipes = await prisma.recipe.findMany({
      where: {
        source_channel: SOURCE_CHANNEL_OLD,
        source_message_id: { in: sourceIds }
      },
      select: {
        source_message_id: true,
        telegram_id: true,
        image_url: true,
        status: true,
        updated_at: true
      }
    });

    const summary = recipes.map((recipe) => ({
      source_message_id: recipe.source_message_id,
      telegram_id: recipe.telegram_id,
      status: recipe.status,
      has_image: Boolean(recipe.image_url),
      updated_at: recipe.updated_at ? recipe.updated_at.toISOString() : null
    }));

    log.debug({ asked: sourceIds.length, found: summary.length }, 'Summary served');

    return Response.json({ ok: true, count: summary.length, recipes: summary });
  } catch (error) {
    log.error({ err: error }, 'Summary lookup failed');
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Summary failed' },
      { status: 500 }
    );
  }
}

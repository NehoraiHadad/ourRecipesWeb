/**
 * GET /api/internal/recipes/summary — what the reconcile job compares against.
 *
 * The Python function reads the last N channel messages and needs to answer one
 * question per message: *does the DB already have exactly this?* Shipping the
 * full `raw_content` of hundreds of recipes back over the wire to answer that
 * would be wasteful, so this returns a SHA-256 of the stored text instead. The
 * caller hashes the message it just read and only POSTs an upsert when the
 * digests differ (or the row is missing entirely).
 *
 * Auth: `Authorization: Bearer <INTERNAL_API_SECRET>`.
 *
 * Query parameters (all optional, `ids` and `since` are mutually usable):
 *  - `ids`   — comma-separated `telegram_id`s to look up (max 500).
 *  - `since` — ISO-8601 timestamp; only recipes updated at/after it.
 *  - `limit` — cap on rows returned (default 200, max 1000).
 *
 * Response:
 * ```jsonc
 * {
 *   "ok": true,
 *   "count": 2,
 *   "recipes": [
 *     { "telegram_id": 12, "content_hash": "…", "content_length": 431,
 *       "status": "ACTIVE", "sync_status": "synced", "has_image": true,
 *       "updated_at": "2026-08-25T09:00:00.000Z" }
 *   ]
 * }
 * ```
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireInternalSecret } from '@/lib/internal/auth';
import { contentHash } from '@/lib/internal/hash';

export const dynamic = 'force-dynamic';

const log = logger.child({ context: 'api/internal/recipes/summary' });

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const MAX_IDS = 500;

function parseIds(raw: string | null): number[] | null {
  if (!raw) return null;

  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ids.length > 0 ? ids.slice(0, MAX_IDS) : [];
}

export async function GET(request: NextRequest): Promise<Response> {
  const unauthorized = requireInternalSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);

    const ids = parseIds(searchParams.get('ids'));
    const sinceRaw = searchParams.get('since');
    const limitRaw = Number(searchParams.get('limit'));
    const take = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.trunc(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

    // `ids=` present but none valid: an explicit empty question, empty answer.
    if (ids !== null && ids.length === 0) {
      return Response.json({ ok: true, count: 0, recipes: [] });
    }

    const where: { telegram_id?: { in: number[] }; updated_at?: { gte: Date } } = {};
    if (ids) where.telegram_id = { in: ids };

    if (sinceRaw) {
      const since = new Date(sinceRaw);
      if (Number.isNaN(since.getTime())) {
        return Response.json({ ok: false, error: 'since must be an ISO-8601 date' }, { status: 400 });
      }
      where.updated_at = { gte: since };
    }

    const recipes = await prisma.recipe.findMany({
      where,
      select: {
        telegram_id: true,
        raw_content: true,
        image_url: true,
        status: true,
        sync_status: true,
        updated_at: true
      },
      orderBy: { telegram_id: 'desc' },
      take
    });

    const summary = recipes.map((recipe) => ({
      telegram_id: recipe.telegram_id,
      content_hash: contentHash(recipe.raw_content ?? ''),
      content_length: (recipe.raw_content ?? '').length,
      status: recipe.status,
      sync_status: recipe.sync_status,
      has_image: Boolean(recipe.image_url),
      updated_at: recipe.updated_at ? recipe.updated_at.toISOString() : null
    }));

    log.debug({ count: summary.length }, 'Summary served');

    return Response.json({ ok: true, count: summary.length, recipes: summary });
  } catch (error) {
    log.error({ err: error }, 'Summary lookup failed');
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Summary failed' },
      { status: 500 }
    );
  }
}

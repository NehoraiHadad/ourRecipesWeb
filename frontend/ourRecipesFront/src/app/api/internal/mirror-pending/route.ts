/**
 * POST /api/internal/mirror-pending — retry outgoing mirrors that failed.
 *
 * Recipes written through the app whose `sendMessage` failed are parked with
 * `sync_status = 'pending_telegram'` (ARCHITECTURE §4.3). This route pushes
 * them to the channel. It is the same code the daily cron job runs, exposed so
 * the Python reconcile pass can finish its work with one more HTTP call — and
 * so a human can nudge it after a Telegram outage.
 *
 * Auth: `Authorization: Bearer <INTERNAL_API_SECRET>`.
 *
 * Body (optional): `{ "limit": 20 }` — 1..100, default 20.
 * Response: `{ ok, processed, mirrored, failed, items[], skippedReason? }`.
 */
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { requireInternalSecret } from '@/lib/internal/auth';
import { mirrorPendingRecipes } from '@/lib/recipes/mirrorPending';

export const dynamic = 'force-dynamic';
/**
 * Up to 100 recipes, each a Telegram round trip — the cron twin declares 60s
 * for the same work, and without a declaration this route inherits the
 * project's 15s default and is killed mid-sweep.
 */
export const maxDuration = 60;

const log = logger.child({ context: 'api/internal/mirror-pending' });

export async function POST(request: NextRequest): Promise<Response> {
  const unauthorized = requireInternalSecret(request);
  if (unauthorized) return unauthorized;

  // An empty body is normal here — the defaults are the common case.
  let limit: number | undefined;
  try {
    const body = (await request.json()) as { limit?: unknown } | null;
    if (body && typeof body.limit === 'number') limit = body.limit;
  } catch {
    limit = undefined;
  }

  try {
    const result = await mirrorPendingRecipes(limit);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    log.error({ err: error }, 'Mirror-pending run failed');
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Mirror failed' },
      { status: 500 }
    );
  }
}

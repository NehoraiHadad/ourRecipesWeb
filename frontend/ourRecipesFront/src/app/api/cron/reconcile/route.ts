/**
 * GET /api/cron/reconcile — the daily safety net (ARCHITECTURE §4.6).
 *
 * Not a synchronisation mechanism: Postgres is the source of truth and the
 * webhook is the input path. This job exists only to clean up after the two
 * things that can silently go wrong —
 *
 *  1. an outgoing mirror that failed while the app was answering the user
 *     (`sync_status = 'pending_telegram'`), retried here directly;
 *  2. a channel post the webhook never received (delivery lost, webhook
 *     briefly unset), which needs MTProto history reads — delegated to the
 *     Python function at `PYTHON_RECONCILE_URL`.
 *
 * Wired up in `vercel.json`. Vercel Cron sends `Authorization: Bearer
 * ${CRON_SECRET}`; `INTERNAL_API_SECRET` is accepted too so the job can be run
 * by hand.
 *
 * Both halves are best-effort and independent: no Python deployment, or a
 * Python deployment that is down, still leaves a useful mirror run. The route
 * always answers 200 unless auth fails.
 */
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { requireCronSecret } from '@/lib/internal/auth';
import { mirrorPendingRecipes, type MirrorPendingResult } from '@/lib/recipes/mirrorPending';

export const dynamic = 'force-dynamic';
/** Telethon needs a couple of seconds to connect; give the round trip room. */
export const maxDuration = 60;

const log = logger.child({ context: 'api/cron/reconcile' });

/** How many recent channel messages the Python pass should re-check. */
const RECONCILE_LIMIT = 50;
const PYTHON_TIMEOUT_MS = 45_000;

interface ReconcileTrigger {
  triggered: boolean;
  status?: number;
  reason?: string;
  result?: unknown;
}

/** Accepts either the function's base URL or the full `/reconcile` URL. */
function reconcileEndpoint(configured: string): string {
  const trimmed = configured.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/reconcile') ? trimmed : `${trimmed}/reconcile`;
}

/** Fire the Python reconcile pass. Never throws — its absence is not an error. */
async function triggerPythonReconcile(): Promise<ReconcileTrigger> {
  const configured = process.env.PYTHON_RECONCILE_URL;
  if (!configured) {
    log.debug('PYTHON_RECONCILE_URL is not set — skipping the history pass');
    return { triggered: false, reason: 'not_configured' };
  }

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    log.error('INTERNAL_API_SECRET is not set — cannot authenticate to the Python function');
    return { triggered: false, reason: 'internal_secret_missing' };
  }

  const url = reconcileEndpoint(configured);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({ limit: RECONCILE_LIMIT }),
      signal: AbortSignal.timeout(PYTHON_TIMEOUT_MS)
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      log.warn({ url, status: response.status, result }, 'Python reconcile returned an error');
      return { triggered: true, status: response.status, reason: 'error_response', result };
    }

    log.info({ url, result }, 'Python reconcile completed');
    return { triggered: true, status: response.status, result };
  } catch (error) {
    log.warn({ err: error, url }, 'Python reconcile could not be reached');
    return {
      triggered: false,
      reason: error instanceof Error ? error.message : 'request_failed'
    };
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  log.info('Reconcile cron started');

  let mirror: MirrorPendingResult;
  try {
    mirror = await mirrorPendingRecipes();
  } catch (error) {
    log.error({ err: error }, 'Mirror phase failed');
    mirror = {
      processed: 0,
      mirrored: 0,
      failed: 0,
      items: [],
      skippedReason: error instanceof Error ? error.message : 'mirror_failed'
    };
  }

  const reconcile = await triggerPythonReconcile();

  const durationMs = Date.now() - startedAt;
  log.info({ mirror: { processed: mirror.processed, mirrored: mirror.mirrored }, reconcile, durationMs },
    'Reconcile cron finished');

  return Response.json({
    ok: true,
    durationMs,
    mirror: {
      processed: mirror.processed,
      mirrored: mirror.mirrored,
      failed: mirror.failed,
      skippedReason: mirror.skippedReason ?? null
    },
    reconcile
  });
}

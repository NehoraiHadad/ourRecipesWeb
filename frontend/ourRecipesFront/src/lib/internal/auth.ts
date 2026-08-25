/**
 * Shared-secret authentication for the machine-to-machine surface
 * (ARCHITECTURE §6).
 *
 * Three callers, three secrets, one comparison routine:
 *  - Telegram → `POST /api/webhooks/telegram`, header
 *    `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`.
 *  - Python reconcile / import → `/api/internal/*`,
 *    `Authorization: Bearer <INTERNAL_API_SECRET>`.
 *  - Vercel Cron → `/api/cron/*`, `Authorization: Bearer <CRON_SECRET>`
 *    (Vercel's own convention), with `INTERNAL_API_SECRET` also accepted so the
 *    job can be triggered manually.
 *
 * All comparisons are constant-time: both sides are SHA-256 digested first, so
 * `timingSafeEqual` always gets equal-length buffers and the secret's *length*
 * does not leak either.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'internal/auth' });

/** Constant-time string comparison. `false` for any nullish/empty input. */
export function secretsMatch(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) return false;

  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();

  return timingSafeEqual(a, b);
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** 401 body shared by every guarded route on this surface. */
export function unauthorizedResponse(message = 'Unauthorized'): Response {
  return Response.json({ ok: false, error: message }, { status: 401 });
}

/**
 * Guards `/api/internal/*`.
 *
 * @returns `null` when authorized, otherwise the 401 `Response` to return.
 */
export function requireInternalSecret(request: Request): Response | null {
  const expected = process.env.INTERNAL_API_SECRET;

  if (!expected) {
    // Fail closed: an unset secret must never mean "open to the world".
    log.error('INTERNAL_API_SECRET is not configured — refusing internal request');
    return unauthorizedResponse('Internal API is not configured');
  }

  if (!secretsMatch(readBearerToken(request), expected)) {
    log.warn('Rejected internal request with a bad or missing bearer token');
    return unauthorizedResponse();
  }

  return null;
}

/**
 * Guards `/api/cron/*`. Accepts `CRON_SECRET` (what Vercel Cron sends) or
 * `INTERNAL_API_SECRET` (manual / internal triggering).
 *
 * @returns `null` when authorized, otherwise the 401 `Response` to return.
 */
export function requireCronSecret(request: Request): Response | null {
  const token = readBearerToken(request);
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!cronSecret && !internalSecret) {
    log.error('Neither CRON_SECRET nor INTERNAL_API_SECRET is configured — refusing cron request');
    return unauthorizedResponse('Cron is not configured');
  }

  if (secretsMatch(token, cronSecret) || secretsMatch(token, internalSecret)) {
    return null;
  }

  log.warn('Rejected cron request with a bad or missing bearer token');
  return unauthorizedResponse();
}

/**
 * Guards `POST /api/webhooks/telegram` by the `secret_token` registered with
 * `setWebhook`.
 */
export function verifyTelegramWebhookSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    log.error('TELEGRAM_WEBHOOK_SECRET is not configured — refusing webhook delivery');
    return false;
  }

  return secretsMatch(request.headers.get('x-telegram-bot-api-secret-token'), expected);
}

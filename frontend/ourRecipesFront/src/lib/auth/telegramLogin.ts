/**
 * Telegram Login Widget verification.
 *
 * Direct port of `AuthService.verify_telegram_login`
 * (`backend/ourRecipesBack/services/auth_service.py`), plus the freshness check
 * Telegram's own documentation requires.
 *
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '@/lib/logger';
import type { TelegramAuthData } from './types';

const log = logger.child({ context: 'auth/telegramLogin' });

/** Login data older than this is rejected even if the signature is valid. */
export const TELEGRAM_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;

export interface VerifyTelegramLoginOptions {
  /** Override the freshness window (seconds). Defaults to 24h. */
  maxAgeSeconds?: number;
  /** Override the bot token (tests). Defaults to `TELEGRAM_BOT_TOKEN`. */
  botToken?: string;
}

/**
 * Verifies that `authData` really came from Telegram.
 *
 * 1. `hash` is removed; the remaining fields are joined as `key=value`
 *    lines sorted alphabetically by key.
 * 2. The secret key is `SHA256(bot_token)`.
 * 3. `HMAC-SHA256(data_check_string, secret)` must equal `hash`
 *    (compared in constant time).
 * 4. `auth_date` must be within the freshness window.
 *
 * Never throws — invalid input is simply `false`.
 */
export function verifyTelegramLogin(
  authData: TelegramAuthData,
  options: VerifyTelegramLoginOptions = {}
): boolean {
  try {
    const botToken = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      log.error('TELEGRAM_BOT_TOKEN is not configured — rejecting Telegram login');
      return false;
    }

    const { hash: checkHash, ...rest } = authData ?? ({} as TelegramAuthData);
    if (!checkHash || typeof checkHash !== 'string') {
      log.warn('Telegram login data has no hash');
      return false;
    }

    const dataCheckString = Object.keys(rest)
      .filter((key) => rest[key] !== undefined && rest[key] !== null)
      .sort()
      .map((key) => `${key}=${rest[key]}`)
      .join('\n');

    const secretKey = createHash('sha256').update(botToken).digest();
    const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (!safeHexEqual(computed, checkHash)) {
      log.warn({ userId: rest.id }, 'Telegram login hash mismatch');
      return false;
    }

    const authDate = Number(rest.auth_date);
    if (!Number.isFinite(authDate)) {
      log.warn({ userId: rest.id }, 'Telegram login has no valid auth_date');
      return false;
    }

    const maxAge = options.maxAgeSeconds ?? TELEGRAM_AUTH_MAX_AGE_SECONDS;
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > maxAge) {
      log.warn({ userId: rest.id, ageSeconds }, 'Telegram login data is stale');
      return false;
    }

    return true;
  } catch (error) {
    log.error({ err: error }, 'Telegram login verification failed');
    return false;
  }
}

/** Constant-time comparison of two hex digests of identical length. */
function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  // `Buffer.from(..., 'hex')` silently truncates on invalid input.
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return timingSafeEqual(bufferA, bufferB);
}

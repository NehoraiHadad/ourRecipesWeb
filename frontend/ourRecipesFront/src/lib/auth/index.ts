/**
 * Auth library — single import point for route handlers and middleware.
 *
 * ```ts
 * import { requireAuth, signSession, ACCESS_TOKEN_COOKIE } from '@/lib/auth';
 * ```
 */
export { verifyTelegramLogin, TELEGRAM_AUTH_MAX_AGE_SECONDS } from './telegramLogin';
export type { VerifyTelegramLoginOptions } from './telegramLogin';

export {
  ACCESS_TOKEN_COOKIE,
  LEGACY_ACCESS_TOKEN_COOKIES,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  verifySession,
  getSessionCookieOptions,
  serializeSessionCookie,
  serializeClearedSessionCookies,
  getTokenFromRequest,
  getSessionFromRequest
} from './session';
export type { SessionCookieOptions, SignSessionOptions, RequestLike } from './session';

export {
  checkEditPermission,
  clearPermissionCache,
  PERMISSION_CACHE_TTL_MS,
  GUEST_ID_PREFIX
} from './permissions';

export { requireAuth, requireEditPermission, authErrorResponse, toApiError } from './guards';

export type {
  AuthType,
  AuthResult,
  AuthFailure,
  SessionInput,
  SessionPayload,
  SessionPermissions,
  TelegramAuthData
} from './types';

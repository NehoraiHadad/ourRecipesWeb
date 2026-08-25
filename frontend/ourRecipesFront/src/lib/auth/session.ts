/**
 * Session JWTs (sign / verify) and the cookie they travel in.
 *
 * Replaces flask-jwt-extended: HS256 over `JWT_SECRET`, httpOnly cookie,
 * `Authorization: Bearer` accepted as an iOS fallback (plan Appendix A).
 */
import { SignJWT, jwtVerify } from 'jose';
import { logger } from '@/lib/logger';
import type { AuthType, SessionInput, SessionPayload } from './types';

const log = logger.child({ context: 'auth/session' });

/**
 * Cookie name. flask-jwt-extended's default — the name the browser already
 * holds for existing sessions and what `backend/tests` asserts on.
 */
export const ACCESS_TOKEN_COOKIE = 'access_token_cookie';

/**
 * Older deployments set `JWT_ACCESS_COOKIE_NAME = "our_recipes_access_token"`
 * (`backend/ourRecipesBack/config.py`). Still read so live sessions survive the
 * cutover; never written.
 */
export const LEGACY_ACCESS_TOKEN_COOKIES = ['our_recipes_access_token'] as const;

/** Token lifetime per auth type, in seconds. */
export const SESSION_MAX_AGE_SECONDS: Record<AuthType, number> = {
  telegram: 7 * 24 * 60 * 60, // 7 days
  guest: 4 * 60 * 60 // 4 hours
};

const ALGORITHM = 'HS256';

/** Reads `JWT_SECRET` at call time so tests can set the env first. */
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

export interface SignSessionOptions {
  /** Lifetime override in seconds. Defaults to {@link SESSION_MAX_AGE_SECONDS}. */
  expiresInSeconds?: number;
}

/**
 * Signs a session JWT.
 *
 * @throws Error when `JWT_SECRET` is missing.
 */
export async function signSession(
  payload: SessionInput,
  options: SignSessionOptions = {}
): Promise<string> {
  const expiresInSeconds = options.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS[payload.type];
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({
    type: payload.type,
    permissions: payload.permissions ?? { can_edit: false },
    created_at: new Date(issuedAt * 1000).toISOString()
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.sub)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresInSeconds)
    .sign(getSecret());
}

/**
 * Verifies a session JWT.
 *
 * @returns The payload, or `null` when the token is missing, malformed,
 *          tampered with or expired.
 */
export async function verifySession(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALGORITHM] });

    if (typeof payload.sub !== 'string' || !payload.sub) {
      log.warn('Session token has no subject');
      return null;
    }

    const type = payload.type === 'guest' ? 'guest' : 'telegram';
    const permissions = (payload.permissions ?? {}) as Partial<SessionPayload['permissions']>;

    return {
      sub: payload.sub,
      type,
      permissions: { can_edit: permissions.can_edit === true },
      created_at: typeof payload.created_at === 'string' ? payload.created_at : undefined,
      iat: payload.iat,
      exp: payload.exp
    };
  } catch (error) {
    log.debug({ err: error }, 'Session verification failed');
    return null;
  }
}

/** Cookie attributes, shaped for `NextResponse.cookies.set(...)`. */
export interface SessionCookieOptions {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/**
 * Builds the session cookie. `Secure` only in production so that local HTTP
 * development keeps working.
 */
export function getSessionCookieOptions(
  token: string,
  options: { type?: AuthType; maxAgeSeconds?: number } = {}
): SessionCookieOptions {
  const maxAge =
    options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS[options.type ?? 'telegram'];

  return {
    name: ACCESS_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge
  };
}

/** Same cookie as a `Set-Cookie` header value, for plain `Response` objects. */
export function serializeSessionCookie(
  token: string,
  options: { type?: AuthType; maxAgeSeconds?: number } = {}
): string {
  const cookie = getSessionCookieOptions(token, options);
  return [
    `${cookie.name}=${cookie.value}`,
    `Path=${cookie.path}`,
    `Max-Age=${cookie.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(cookie.secure ? ['Secure'] : [])
  ].join('; ');
}

/** `Set-Cookie` values that clear the session (current + legacy names). */
export function serializeClearedSessionCookies(): string[] {
  return [ACCESS_TOKEN_COOKIE, ...LEGACY_ACCESS_TOKEN_COOKIES].map((name) =>
    [
      `${name}=`,
      'Path=/',
      'Max-Age=0',
      'HttpOnly',
      'SameSite=Lax',
      ...(process.env.NODE_ENV === 'production' ? ['Secure'] : [])
    ].join('; ')
  );
}

/** Minimal structural type for the cookie jar on `NextRequest`. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/** Anything the auth helpers can read a token from: `Request` or `NextRequest`. */
export type RequestLike = Request | { cookies: CookieReader; headers: Headers };

function hasCookieJar(request: unknown): request is { cookies: CookieReader } {
  return (
    typeof request === 'object' &&
    request !== null &&
    'cookies' in request &&
    typeof (request as { cookies?: { get?: unknown } }).cookies?.get === 'function'
  );
}

function readCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

/**
 * Extracts the JWT from a request: session cookie first (current then legacy
 * name), then `Authorization: Bearer` — the fallback the iOS client relies on
 * when third-party cookies are blocked.
 *
 * Accepts a `NextRequest` or a plain `Request`.
 */
export function getTokenFromRequest(request: RequestLike): string | null {
  const cookieNames = [ACCESS_TOKEN_COOKIE, ...LEGACY_ACCESS_TOKEN_COOKIES];

  if (hasCookieJar(request)) {
    for (const name of cookieNames) {
      const value = request.cookies.get(name)?.value;
      if (value) return value;
    }
  }

  const headers = (request as Request).headers;
  const cookieHeader = headers?.get('cookie') ?? null;
  for (const name of cookieNames) {
    const value = readCookieHeader(cookieHeader, name);
    if (value) return value;
  }

  const authorization = headers?.get('authorization');
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1].trim();
  }

  return null;
}

/** Convenience: read + verify in one step. */
export async function getSessionFromRequest(request: RequestLike): Promise<SessionPayload | null> {
  return verifySession(getTokenFromRequest(request));
}

/**
 * API authentication middleware (ARCHITECTURE §4.5.4).
 *
 * Every `/api/**` route requires a valid session JWT unless it appears in the
 * public list below. The list is the faithful port of the Flask blueprints:
 * a route that carried `@jwt_required()` there needs a token here. Guests hold
 * real JWTs too, so "browse as guest" keeps working.
 *
 * Runs on the edge runtime, so this file deliberately duplicates the little bit
 * of `@/lib/auth` it needs (cookie names, `jwtVerify`) instead of importing the
 * barrel — that pulls in `node:crypto` and `pino`, neither of which belongs
 * here.
 *
 * `can_edit` is **not** enforced here: routes that mutate call
 * `requireEditPermission`, which re-checks against Telegram.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/** Mirrors `ACCESS_TOKEN_COOKIE` + `LEGACY_ACCESS_TOKEN_COOKIES`. */
const COOKIE_NAMES = ['access_token_cookie', 'our_recipes_access_token'] as const;

/** Public regardless of method. */
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/guest',
  '/api/auth/logout',
  '/api/auth/validate',
  // Authenticated by `X-Telegram-Bot-Api-Secret-Token` inside the handler.
  '/api/webhooks/telegram',
  // Authenticated by the `MCP_SHARED_KEY` bearer check inside the handler.
  '/api/mcp',
  '/api/ping'
]);

/** Public prefixes — these authenticate with `INTERNAL_API_SECRET` in-route. */
const PUBLIC_PREFIXES = ['/api/internal/', '/api/cron/'];

/**
 * Public GET reads, matching the Flask routes that had no `@jwt_required()`:
 * a single recipe by telegram id, and a menu opened through its share token.
 */
const PUBLIC_GET_PATTERNS = [/^\/api\/recipes\/\d+$/, /^\/api\/menus\/shared\/[^/]+$/];

function isPublic(pathname: string, method: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (method === 'GET' || method === 'HEAD') {
    return PUBLIC_GET_PATTERNS.some((pattern) => pattern.test(pathname));
  }
  return false;
}

/** Cookie (current then legacy name) → `Authorization: Bearer`. */
function getToken(request: NextRequest): string | null {
  for (const name of COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) return value;
  }

  const authorization = request.headers.get('authorization');
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1].trim();
  }

  return null;
}

function unauthorized(message: string): NextResponse {
  return NextResponse.json({ authenticated: false, message }, { status: 401 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Tolerate a trailing slash so `/api/ping/` is not silently protected.
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // The matcher also covers `/_next/data/<build>/api…` rewrites; only real API
  // paths are ours to guard.
  if (!normalized.startsWith('/api')) return NextResponse.next();

  // CORS preflight never carries credentials.
  if (request.method === 'OPTIONS') return NextResponse.next();

  if (isPublic(normalized, request.method)) return NextResponse.next();

  const token = getToken(request);
  if (!token) return unauthorized('No authentication token found');

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Misconfiguration must fail closed, never open.
    return NextResponse.json(
      { authenticated: false, message: 'Server authentication is not configured' },
      { status: 500 }
    );
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
  } catch {
    return unauthorized('Invalid or expired token');
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};

/**
 * @vitest-environment node
 *
 * Middleware contract: which `/api/**` paths are public, and what a protected
 * path does with a missing / bad / valid token.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { middleware } from '@/middleware';

const JWT_SECRET = 'test-jwt-secret-value-not-a-real-one';

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

async function makeToken(
  options: {
    sub?: string;
    type?: 'telegram' | 'guest';
    canEdit?: boolean;
    expiresInSeconds?: number;
    secret?: string;
  } = {}
): Promise<string> {
  const {
    sub = '987654321',
    type = 'telegram',
    canEdit = false,
    expiresInSeconds = 3600,
    secret = JWT_SECRET
  } = options;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ type, permissions: { can_edit: canEdit } })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
}

function request(
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const { method = 'GET', headers = {} } = options;
  return new NextRequest(new URL(path, 'http://localhost:3000'), { method, headers } as any);
}

/** `NextResponse.next()` is marked with this internal header. */
function passedThrough(response: Response): boolean {
  return response.headers.get('x-middleware-next') === '1';
}

describe('middleware — public paths', () => {
  const alwaysPublic = [
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/guest'],
    ['POST', '/api/auth/logout'],
    ['GET', '/api/auth/validate'],
    ['POST', '/api/webhooks/telegram'],
    ['GET', '/api/ping'],
    ['GET', '/api/ping/'],
    ['POST', '/api/internal/recipes/upsert'],
    ['GET', '/api/cron/reconcile']
  ] as const;

  it.each(alwaysPublic)('lets %s %s through without a token', async (method, path) => {
    const response = await middleware(request(path, { method }));
    expect(passedThrough(response)).toBe(true);
  });

  const publicGets = ['/api/recipes/12345', '/api/menus/shared/abc123token'];

  it.each(publicGets)('lets GET %s through without a token', async (path) => {
    const response = await middleware(request(path));
    expect(passedThrough(response)).toBe(true);
  });

  it('protects the same paths for non-GET methods', async () => {
    for (const path of publicGets) {
      const response = await middleware(request(path, { method: 'PUT' }));
      expect(response.status).toBe(401);
    }
  });

  it('lets CORS preflight through', async () => {
    const response = await middleware(request('/api/recipes/search', { method: 'OPTIONS' }));
    expect(passedThrough(response)).toBe(true);
  });
});

describe('middleware — protected paths', () => {
  const protectedPaths = [
    ['GET', '/api/recipes/search'],
    ['GET', '/api/recipes/manage'],
    ['GET', '/api/categories'],
    ['GET', '/api/menus'],
    ['GET', '/api/places'],
    ['POST', '/api/recipes'],
    ['PUT', '/api/recipes/12345'],
    ['GET', '/api/menus/7'],
    ['PATCH', '/api/shopping-list/items/3']
  ] as const;

  it.each(protectedPaths)('rejects %s %s without a token', async (method, path) => {
    const response = await middleware(request(path, { method }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      authenticated: false,
      message: 'No authentication token found'
    });
  });

  it('accepts a valid token from the session cookie', async () => {
    const token = await makeToken();
    const response = await middleware(
      request('/api/recipes/search', { headers: { cookie: `access_token_cookie=${token}` } })
    );

    expect(passedThrough(response)).toBe(true);
  });

  it('accepts a valid token from the legacy cookie', async () => {
    const token = await makeToken();
    const response = await middleware(
      request('/api/categories', { headers: { cookie: `our_recipes_access_token=${token}` } })
    );

    expect(passedThrough(response)).toBe(true);
  });

  it('accepts a valid token from Authorization: Bearer', async () => {
    const token = await makeToken();
    const response = await middleware(
      request('/api/categories', { headers: { authorization: `Bearer ${token}` } })
    );

    expect(passedThrough(response)).toBe(true);
  });

  it('accepts a guest token — guests may browse', async () => {
    const token = await makeToken({ sub: 'guest_abcd1234', type: 'guest' });
    const response = await middleware(
      request('/api/recipes/search', { headers: { authorization: `Bearer ${token}` } })
    );

    expect(passedThrough(response)).toBe(true);
  });

  it('does not enforce can_edit — that is the route handler’s job', async () => {
    const token = await makeToken({ canEdit: false });
    const response = await middleware(
      request('/api/recipes', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` }
      })
    );

    expect(passedThrough(response)).toBe(true);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await makeToken({ secret: 'a-completely-different-secret-value' });
    const response = await middleware(
      request('/api/categories', { headers: { authorization: `Bearer ${token}` } })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      authenticated: false,
      message: 'Invalid or expired token'
    });
  });

  it('rejects an expired token', async () => {
    const token = await makeToken({ expiresInSeconds: -60 });
    const response = await middleware(
      request('/api/categories', { headers: { authorization: `Bearer ${token}` } })
    );

    expect(response.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const response = await middleware(
      request('/api/categories', { headers: { authorization: 'Bearer not-a-jwt' } })
    );

    expect(response.status).toBe(401);
  });

  it('fails closed with 500 when JWT_SECRET is missing', async () => {
    const token = await makeToken();
    delete process.env.JWT_SECRET;

    const response = await middleware(
      request('/api/categories', { headers: { authorization: `Bearer ${token}` } })
    );

    expect(response.status).toBe(500);
    expect((await response.json()).authenticated).toBe(false);
  });
});

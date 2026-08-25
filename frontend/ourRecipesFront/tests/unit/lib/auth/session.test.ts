/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import {
  ACCESS_TOKEN_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  getSessionCookieOptions,
  getTokenFromRequest,
  serializeClearedSessionCookies,
  serializeSessionCookie,
  signSession,
  verifySession
} from '@/lib/auth/session';

const SECRET = 'test-jwt-secret-value-not-a-real-one';

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  vi.unstubAllEnvs();
});

function setNodeEnv(value: 'development' | 'production') {
  vi.stubEnv('NODE_ENV', value);
}

describe('signSession / verifySession', () => {
  it('round-trips a telegram session', async () => {
    const token = await signSession({
      sub: '12345678',
      type: 'telegram',
      permissions: { can_edit: true }
    });

    const session = await verifySession(token);

    expect(session).not.toBeNull();
    expect(session!.sub).toBe('12345678');
    expect(session!.type).toBe('telegram');
    expect(session!.permissions.can_edit).toBe(true);
    expect(session!.created_at).toBeTypeOf('string');
  });

  it('round-trips a guest session with no edit permission', async () => {
    const token = await signSession({ sub: 'guest_abc', type: 'guest' });
    const session = await verifySession(token);

    expect(session!.sub).toBe('guest_abc');
    expect(session!.type).toBe('guest');
    expect(session!.permissions.can_edit).toBe(false);
  });

  it('round-trips the display name claim', async () => {
    const token = await signSession({
      sub: '12345678',
      type: 'telegram',
      name: 'דנה כהן'
    });

    expect((await verifySession(token))!.name).toBe('דנה כהן');
  });

  it('round-trips a guest display name', async () => {
    const token = await signSession({ sub: 'guest_abcd1234', type: 'guest', name: 'אורח_1234' });

    expect((await verifySession(token))!.name).toBe('אורח_1234');
  });

  it('leaves the name claim out entirely when it is absent or blank', async () => {
    const withoutName = await signSession({ sub: '1', type: 'telegram' });
    const withBlankName = await signSession({ sub: '1', type: 'telegram', name: '   ' });

    expect((await verifySession(withoutName))!.name).toBeUndefined();
    expect((await verifySession(withBlankName))!.name).toBeUndefined();

    // Not merely undefined on read — the claim is never written.
    const claims = JSON.parse(Buffer.from(withBlankName.split('.')[1], 'base64url').toString());
    expect('name' in claims).toBe(false);
  });

  it('trims the name on the way in', async () => {
    const trimmed = await signSession({ sub: '1', type: 'telegram', name: '  דנה  ' });
    expect((await verifySession(trimmed))!.name).toBe('דנה');
  });

  it('drops a non-string name claim rather than leaking it through the typed payload', async () => {
    const token = await new SignJWT({ type: 'telegram', permissions: { can_edit: false }, name: 42 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));

    const session = await verifySession(token);
    expect(session!.sub).toBe('1');
    expect(session!.name).toBeUndefined();
  });

  it('still verifies tokens minted before the name claim existed', async () => {
    // A pre-`name` token is byte-identical to one signed without a name today.
    const legacy = await signSession({ sub: '9', type: 'telegram', permissions: { can_edit: true } });
    const session = await verifySession(legacy);

    expect(session!.sub).toBe('9');
    expect(session!.permissions.can_edit).toBe(true);
    expect(session!.name).toBeUndefined();
  });

  it('defaults expiry to 7 days for telegram and 4 hours for guest', async () => {
    const telegram = await verifySession(await signSession({ sub: '1', type: 'telegram' }));
    const guest = await verifySession(await signSession({ sub: 'guest_1', type: 'guest' }));

    expect(telegram!.exp! - telegram!.iat!).toBe(SESSION_MAX_AGE_SECONDS.telegram);
    expect(guest!.exp! - guest!.iat!).toBe(SESSION_MAX_AGE_SECONDS.guest);
  });

  it('honours an expiresInSeconds override', async () => {
    const token = await signSession({ sub: '1', type: 'telegram' }, { expiresInSeconds: 60 });
    const session = await verifySession(token);
    expect(session!.exp! - session!.iat!).toBe(60);
  });

  it('rejects an expired token', async () => {
    const token = await signSession({ sub: '1', type: 'telegram' }, { expiresInSeconds: -60 });
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signSession({ sub: '1', type: 'telegram' });
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'attacker', type: 'telegram', permissions: { can_edit: true } })
    ).toString('base64url');

    await expect(verifySession([header, forged, signature].join('.'))).resolves.toBeNull();
    expect(payload).not.toBe(forged);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession({ sub: '1', type: 'telegram' });
    process.env.JWT_SECRET = 'some-other-secret-value-entirely';
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it('rejects garbage and empty input', async () => {
    await expect(verifySession('not-a-jwt')).resolves.toBeNull();
    await expect(verifySession(null)).resolves.toBeNull();
    await expect(verifySession(undefined)).resolves.toBeNull();
  });

  it('throws when JWT_SECRET is missing', async () => {
    delete process.env.JWT_SECRET;
    await expect(signSession({ sub: '1', type: 'telegram' })).rejects.toThrow('JWT_SECRET');
  });
});

describe('cookie helpers', () => {
  it('uses the flask-jwt-extended cookie name and safe attributes', () => {
    setNodeEnv('development');
    const cookie = getSessionCookieOptions('TOKEN', { type: 'telegram' });

    expect(cookie.name).toBe('access_token_cookie');
    expect(ACCESS_TOKEN_COOKIE).toBe('access_token_cookie');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.path).toBe('/');
    expect(cookie.secure).toBe(false);
    expect(cookie.maxAge).toBe(SESSION_MAX_AGE_SECONDS.telegram);
  });

  it('marks the cookie Secure in production', () => {
    setNodeEnv('production');
    expect(getSessionCookieOptions('TOKEN').secure).toBe(true);
    expect(serializeSessionCookie('TOKEN')).toContain('Secure');
  });

  it('serializes guest cookies with the 4h max-age', () => {
    setNodeEnv('development');
    const header = serializeSessionCookie('TOKEN', { type: 'guest' });

    expect(header).toContain('access_token_cookie=TOKEN');
    expect(header).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS.guest}`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).not.toContain('Secure');
  });

  it('clears both the current and legacy cookie names', () => {
    const cleared = serializeClearedSessionCookies();
    expect(cleared.some((c) => c.startsWith('access_token_cookie=;'))).toBe(true);
    expect(cleared.some((c) => c.startsWith('our_recipes_access_token=;'))).toBe(true);
    expect(cleared.every((c) => c.includes('Max-Age=0'))).toBe(true);
  });
});

describe('getTokenFromRequest', () => {
  it('reads the token from the NextRequest cookie jar', () => {
    const request = new NextRequest('http://localhost/api/recipes');
    request.cookies.set(ACCESS_TOKEN_COOKIE, 'COOKIE_TOKEN');

    expect(getTokenFromRequest(request)).toBe('COOKIE_TOKEN');
  });

  it('reads the token from a plain Request cookie header', () => {
    const request = new Request('http://localhost/api/recipes', {
      headers: { cookie: `other=1; ${ACCESS_TOKEN_COOKIE}=PLAIN_TOKEN` }
    });

    expect(getTokenFromRequest(request)).toBe('PLAIN_TOKEN');
  });

  it('falls back to the legacy cookie name', () => {
    const request = new Request('http://localhost/api/recipes', {
      headers: { cookie: 'our_recipes_access_token=LEGACY_TOKEN' }
    });

    expect(getTokenFromRequest(request)).toBe('LEGACY_TOKEN');
  });

  it('falls back to the Authorization: Bearer header (iOS)', () => {
    const request = new Request('http://localhost/api/recipes', {
      headers: { authorization: 'Bearer HEADER_TOKEN' }
    });

    expect(getTokenFromRequest(request)).toBe('HEADER_TOKEN');
  });

  it('prefers the cookie over the Authorization header', () => {
    const request = new Request('http://localhost/api/recipes', {
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=COOKIE_TOKEN`,
        authorization: 'Bearer HEADER_TOKEN'
      }
    });

    expect(getTokenFromRequest(request)).toBe('COOKIE_TOKEN');
  });

  it('returns null when nothing is present', () => {
    expect(getTokenFromRequest(new Request('http://localhost/api/recipes'))).toBeNull();
  });
});

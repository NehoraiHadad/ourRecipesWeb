/**
 * @vitest-environment node
 *
 * Integration tests for the four auth routes (Wave 1.A).
 * Telegram is fully mocked — no network, no DB.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

vi.mock('@/lib/telegram/botApi', () => ({
  getChatMember: vi.fn()
}));

import { getChatMember } from '@/lib/telegram/botApi';
import { clearPermissionCache, signSession, verifySession } from '@/lib/auth';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as guestPOST } from '@/app/api/auth/guest/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { GET as validateGET } from '@/app/api/auth/validate/route';

const BOT_TOKEN = '123456:test-bot-token';
const JWT_SECRET = 'test-jwt-secret-value-not-a-real-one';
const CHANNEL_ID = '-1001234567890';

const getChatMemberMock = vi.mocked(getChatMember);

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.TELEGRAM_OLD_CHANNEL_ID = CHANNEL_ID;
  clearPermissionCache();
  getChatMemberMock.mockReset();
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_OLD_CHANNEL_ID;
});

/** Builds Login-Widget payload signed the way Telegram signs it. */
function signAuthData(fields: Record<string, string | number>): Record<string, string | number> {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHash('sha256').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return { ...fields, hash };
}

function freshAuthData(overrides: Record<string, string | number> = {}) {
  return signAuthData({
    id: 987654321,
    first_name: 'דנה',
    username: 'dana',
    auth_date: Math.floor(Date.now() / 1000),
    ...overrides
  });
}

function postRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  } as any);
}

function getRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { method: 'GET', headers } as any);
}

function setCookieValues(response: Response): string[] {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof getSetCookie === 'function') return getSetCookie.call(response.headers);
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

describe('POST /api/auth/login', () => {
  it('signs in an admin: token in body + cookie, canEdit true', async () => {
    getChatMemberMock.mockResolvedValue({
      status: 'administrator',
      can_edit_messages: true
    } as any);

    const response = await loginPOST(postRequest('/api/auth/login', freshAuthData()));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.login).toBe(true);
    expect(json.canEdit).toBe(true);
    expect(json.user).toEqual({ id: '987654321', name: 'דנה', type: 'telegram' });
    expect(json.message).toBeNull();
    expect(typeof json.token).toBe('string');

    const session = await verifySession(json.token);
    expect(session).not.toBeNull();
    expect(session!.sub).toBe('987654321');
    expect(session!.type).toBe('telegram');
    expect(session!.permissions.can_edit).toBe(true);
    // The display name rides in the token so it survives a reload.
    expect(session!.name).toBe('דנה');

    const cookies = setCookieValues(response);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain(`access_token_cookie=${json.token}`);
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
    expect(cookies[0]).toContain('Max-Age=604800');
  });

  it('signs in a non-admin with canEdit false and the join-channel message', async () => {
    getChatMemberMock.mockResolvedValue({ status: 'member' } as any);

    const response = await loginPOST(postRequest('/api/auth/login', freshAuthData()));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.login).toBe(true);
    expect(json.canEdit).toBe(false);
    expect(json.message).toBe(
      'אין לך הרשאות עריכה. יש להצטרף לערוץ הטלגרם כדי לקבל הרשאות.'
    );
    expect((await verifySession(json.token))!.permissions.can_edit).toBe(false);
  });

  it('joins first_name and last_name into the name claim and the response', async () => {
    getChatMemberMock.mockResolvedValue({ status: 'member' } as any);

    const response = await loginPOST(
      postRequest('/api/auth/login', freshAuthData({ last_name: 'כהן' }))
    );
    const json = await response.json();

    expect(json.user.name).toBe('דנה כהן');
    expect((await verifySession(json.token))!.name).toBe('דנה כהן');
  });

  it('omits the name claim when Telegram sent no first_name', async () => {
    getChatMemberMock.mockResolvedValue({ status: 'member' } as any);

    const authData = signAuthData({
      id: 987654321,
      username: 'dana',
      auth_date: Math.floor(Date.now() / 1000)
    });
    const json = await (await loginPOST(postRequest('/api/auth/login', authData))).json();

    expect(json.user.name).toBe('');
    expect((await verifySession(json.token))!.name).toBeUndefined();
  });

  it('rejects a tampered hash with 401 and sets no cookie', async () => {
    const authData = freshAuthData();
    authData.first_name = 'מישהו אחר'; // signed payload no longer matches

    const response = await loginPOST(postRequest('/api/auth/login', authData));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'אימות נכשל' });
    expect(setCookieValues(response)).toHaveLength(0);
    expect(getChatMemberMock).not.toHaveBeenCalled();
  });

  it('rejects stale login data (auth_date older than 24h)', async () => {
    const stale = freshAuthData({ auth_date: Math.floor(Date.now() / 1000) - 60 * 60 * 25 });

    const response = await loginPOST(postRequest('/api/auth/login', stale));

    expect(response.status).toBe(401);
  });

  it('rejects a body without an id with 400', async () => {
    const response = await loginPOST(postRequest('/api/auth/login', { first_name: 'x' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'נתוני משתמש לא תקינים' });
  });

  it('rejects a non-JSON body with 400', async () => {
    const response = await loginPOST(postRequest('/api/auth/login'));

    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/guest', () => {
  it('issues a 4-hour guest token in the body and the cookie', async () => {
    const response = await guestPOST(postRequest('/api/auth/guest', { guestName: 'Guest' }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.login).toBe(true);
    expect(json.canEdit).toBe(false);
    expect(json.user.id).toMatch(/^guest_[0-9a-f]{8}$/);
    expect(json.user.type).toBe('guest');
    expect(json.user.name).toBe(`אורח_${String(json.user.id).slice(-4)}`);
    expect(json.message).toBe('ברוכים הבאים! שימו לב שכמשתמש אורח אין אפשרות לערוך מתכונים.');

    const session = await verifySession(json.token);
    expect(session!.sub).toBe(json.user.id);
    expect(session!.type).toBe('guest');
    expect(session!.permissions.can_edit).toBe(false);
    // The generated guest name is a claim, so a reload gets the same name back.
    expect(session!.name).toBe(json.user.name);
    expect(session!.exp! - session!.iat!).toBe(4 * 60 * 60);

    const cookies = setCookieValues(response);
    expect(cookies[0]).toContain(`access_token_cookie=${json.token}`);
    expect(cookies[0]).toContain('Max-Age=14400');
  });

  it('issues a distinct id per call', async () => {
    const first = await (await guestPOST(postRequest('/api/auth/guest'))).json();
    const second = await (await guestPOST(postRequest('/api/auth/guest'))).json();

    expect(first.user.id).not.toBe(second.user.id);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns { logout: true } and expires both cookie names', async () => {
    const response = await logoutPOST(postRequest('/api/auth/logout'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ logout: true });

    const cookies = setCookieValues(response);
    expect(cookies).toHaveLength(2);
    expect(cookies.join('\n')).toContain('access_token_cookie=;');
    expect(cookies.join('\n')).toContain('our_recipes_access_token=;');
    for (const cookie of cookies) {
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
    }
  });
});

describe('GET /api/auth/validate', () => {
  it('validates a telegram session from the cookie and re-checks permissions', async () => {
    getChatMemberMock.mockResolvedValue({ status: 'creator' } as any);

    const login = await (await loginPOST(postRequest('/api/auth/login', freshAuthData()))).json();
    getChatMemberMock.mockClear();
    clearPermissionCache();

    const response = await validateGET(
      getRequest('/api/auth/validate', { cookie: `access_token_cookie=${login.token}` })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: true,
      canEdit: true,
      user_id: '987654321',
      name: 'דנה',
      type: 'telegram',
      message: null
    });
    expect(getChatMemberMock).toHaveBeenCalledTimes(1);
  });

  it('returns the telegram display name so the Header survives a reload', async () => {
    getChatMemberMock.mockResolvedValue({ status: 'creator' } as any);

    const login = await (
      await loginPOST(postRequest('/api/auth/login', freshAuthData({ last_name: 'כהן' })))
    ).json();
    clearPermissionCache();

    // Second call with only the cookie — the reload path, no login payload in hand.
    const json = await (
      await validateGET(
        getRequest('/api/auth/validate', { cookie: `access_token_cookie=${login.token}` })
      )
    ).json();

    expect(json.name).toBe('דנה כהן');
    expect(json.name).toBe(login.user.name);
  });

  it('omits name for a token minted before the claim existed', async () => {
    getChatMemberMock.mockResolvedValue({ status: 'creator' } as any);

    const legacyToken = await signSession({
      sub: '987654321',
      type: 'telegram',
      permissions: { can_edit: true }
    });

    const json = await (
      await validateGET(getRequest('/api/auth/validate', { authorization: `Bearer ${legacyToken}` }))
    ).json();

    expect(json.authenticated).toBe(true);
    expect(json.user_id).toBe('987654321');
    expect('name' in json).toBe(false);
  });

  it('falls back to the derived guest name for a token minted before the claim existed', async () => {
    const legacyToken = await signSession({ sub: 'guest_abcd1234', type: 'guest' });

    const json = await (
      await validateGET(getRequest('/api/auth/validate', { authorization: `Bearer ${legacyToken}` }))
    ).json();

    expect(json.name).toBe('אורח_1234');
  });

  it('reports canEdit false when the user is no longer an admin', async () => {
    getChatMemberMock.mockResolvedValue({ status: 'creator' } as any);
    const login = await (await loginPOST(postRequest('/api/auth/login', freshAuthData()))).json();

    clearPermissionCache();
    getChatMemberMock.mockResolvedValue({ status: 'left' } as any);

    const response = await validateGET(
      getRequest('/api/auth/validate', { cookie: `access_token_cookie=${login.token}` })
    );
    const json = await response.json();

    expect(json.authenticated).toBe(true);
    expect(json.canEdit).toBe(false);
    expect(json.message).toBe('אין לך הרשאות עריכה. יש להצטרף לערוץ הטלגרם כדי לקבל הרשאות.');
  });

  it('accepts the token from an Authorization: Bearer header (iOS fallback)', async () => {
    const guest = await (await guestPOST(postRequest('/api/auth/guest'))).json();

    const response = await validateGET(
      getRequest('/api/auth/validate', { authorization: `Bearer ${guest.token}` })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: true,
      canEdit: false,
      user_id: guest.user.id,
      name: guest.user.name,
      type: 'guest',
      message: 'משתמשי אורח לא יכולים לערוך מתכונים'
    });
    expect(getChatMemberMock).not.toHaveBeenCalled();
  });

  it('accepts the legacy cookie name', async () => {
    const guest = await (await guestPOST(postRequest('/api/auth/guest'))).json();

    const response = await validateGET(
      getRequest('/api/auth/validate', {
        cookie: `our_recipes_access_token=${guest.token}`
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).authenticated).toBe(true);
  });

  it('returns 401 without a token', async () => {
    const response = await validateGET(getRequest('/api/auth/validate'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      authenticated: false,
      message: 'No authentication token found'
    });
  });

  it('returns 401 for a token signed with another secret', async () => {
    const guest = await (await guestPOST(postRequest('/api/auth/guest'))).json();
    process.env.JWT_SECRET = 'a-completely-different-secret-value';

    const response = await validateGET(
      getRequest('/api/auth/validate', { authorization: `Bearer ${guest.token}` })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      authenticated: false,
      message: 'Invalid or expired token'
    });
  });
});

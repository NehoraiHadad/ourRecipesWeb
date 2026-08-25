/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authErrorResponse, requireAuth, requireEditPermission, toApiError } from '@/lib/auth/guards';
import { signSession, ACCESS_TOKEN_COOKIE } from '@/lib/auth/session';
import { checkEditPermission } from '@/lib/auth/permissions';

vi.mock('@/lib/auth/permissions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/permissions')>(
    '@/lib/auth/permissions'
  );
  return { ...actual, checkEditPermission: vi.fn() };
});

const checkEditPermissionMock = vi.mocked(checkEditPermission);

function requestWithToken(token: string): Request {
  return new Request('http://localhost/api/recipes', {
    headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-jwt-secret-value-not-a-real-one';
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe('requireAuth', () => {
  it('returns the session for a valid token', async () => {
    const token = await signSession({ sub: '12345678', type: 'telegram', permissions: { can_edit: true } });

    const result = await requireAuth(requestWithToken(token));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.sub).toBe('12345678');
      expect(result.session.type).toBe('telegram');
    }
  });

  it('accepts the Authorization: Bearer fallback', async () => {
    const token = await signSession({ sub: 'guest_1', type: 'guest' });
    const request = new Request('http://localhost/api/recipes', {
      headers: { authorization: `Bearer ${token}` }
    });

    const result = await requireAuth(request);
    expect(result.ok).toBe(true);
  });

  it('401s when no token is present', async () => {
    const result = await requireAuth(new Request('http://localhost/api/recipes'));

    expect(result).toEqual({ ok: false, status: 401, message: 'No authentication token found' });
  });

  it('401s on an expired token', async () => {
    const token = await signSession({ sub: '1', type: 'telegram' }, { expiresInSeconds: -10 });

    const result = await requireAuth(requestWithToken(token));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});

describe('requireEditPermission', () => {
  it('allows a channel admin', async () => {
    checkEditPermissionMock.mockResolvedValue(true);
    const token = await signSession({ sub: '12345678', type: 'telegram' });

    const result = await requireEditPermission(requestWithToken(token));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.permissions.can_edit).toBe(true);
    expect(checkEditPermissionMock).toHaveBeenCalledWith('12345678');
  });

  it('403s a telegram user without channel edit rights, even with a can_edit claim', async () => {
    checkEditPermissionMock.mockResolvedValue(false);
    const token = await signSession({
      sub: '12345678',
      type: 'telegram',
      permissions: { can_edit: true }
    });

    const result = await requireEditPermission(requestWithToken(token));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('403s guests without calling Telegram', async () => {
    const token = await signSession({ sub: 'guest_abc', type: 'guest' });

    const result = await requireEditPermission(requestWithToken(token));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(checkEditPermissionMock).not.toHaveBeenCalled();
  });

  it('401s (not 403) when unauthenticated', async () => {
    const result = await requireEditPermission(new Request('http://localhost/api/recipes'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});

describe('failure helpers', () => {
  it('authErrorResponse renders the status and message', async () => {
    const response = authErrorResponse({ ok: false, status: 403, message: 'nope' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      error: { message: 'nope', statusCode: 403 }
    });
  });

  it('toApiError produces an ApiError with the same status', () => {
    const error = toApiError({ ok: false, status: 401, message: 'no token' });

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('no token');
  });
});

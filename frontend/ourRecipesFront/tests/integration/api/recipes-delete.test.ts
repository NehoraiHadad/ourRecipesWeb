// @vitest-environment node
/**
 * Integration tests for DELETE /api/recipes/:telegram_id (Stage F1).
 * Prisma is fully mocked — no real network, no real DB.
 *
 * With the main Telegram channel gone, archiving is a single row update —
 * no channel-message delete to attempt or fall back around.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest } from '@tests/helpers/api-test-helpers';

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, requireEditPermission: vi.fn() };
});

import { requireEditPermission } from '@/lib/auth';
import { DELETE } from '@/app/api/recipes/[telegram_id]/route';

const requireEditPermissionMock = vi.mocked(requireEditPermission);

const EDITOR_SESSION = {
  ok: true as const,
  session: { sub: '111', type: 'telegram' as const, permissions: { can_edit: true } }
};

function deleteRequest(telegramId: string) {
  return createMockRequest(`http://localhost:3000/api/recipes/${telegramId}`, { method: 'DELETE' });
}

beforeEach(() => {
  resetPrismaMock();
  requireEditPermissionMock.mockReset();
  requireEditPermissionMock.mockResolvedValue(EDITOR_SESSION as any);
});

describe('DELETE /api/recipes/:telegram_id', () => {
  it('rejects non-editors', async () => {
    requireEditPermissionMock.mockResolvedValue({
      ok: false,
      status: 403,
      message: 'User does not have edit permissions'
    });

    const response = await DELETE(deleteRequest('555'), { params: { telegram_id: '555' } });
    expect(response.status).toBe(403);
  });

  it('401s when unauthenticated', async () => {
    requireEditPermissionMock.mockResolvedValue({
      ok: false,
      status: 401,
      message: 'No authentication token found'
    });

    const response = await DELETE(deleteRequest('555'), { params: { telegram_id: '555' } });
    expect(response.status).toBe(401);
  });

  it('404s when the recipe does not exist', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue(null);

    const response = await DELETE(deleteRequest('555'), { params: { telegram_id: '555' } });
    expect(response.status).toBe(404);
    expect(prismaMock.recipe.update).not.toHaveBeenCalled();
  });

  it('looks the recipe up through VISIBLE_RECIPE, so an already-archived one 404s', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue(null);

    await DELETE(deleteRequest('555'), { params: { telegram_id: '555' } });

    expect(prismaMock.recipe.findFirst.mock.calls[0][0]).toMatchObject({
      where: { status: 'ACTIVE', telegram_id: 555 }
    });
  });

  it('archives the recipe, answering 204', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue({ id: 1, telegram_id: 555 } as any);
    prismaMock.recipe.update.mockResolvedValue({ id: 1, telegram_id: 555, status: 'ARCHIVED' } as any);

    const response = await DELETE(deleteRequest('555'), { params: { telegram_id: '555' } });

    expect(response.status).toBe(204);
    expect(prismaMock.recipe.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ARCHIVED' }
    });
  });
});

// @vitest-environment node
/**
 * Integration tests for the versions routes (Wave 1.B):
 *  - GET/POST /api/versions/recipe/:telegram_id
 *  - POST     /api/versions/recipe/:telegram_id/restore/:versionId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: mockDeep<PrismaClient>()
}));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, requireAuth: vi.fn(), requireEditPermission: vi.fn() };
});

vi.mock('@/lib/telegram/botApi', () => ({
  editMessageText: vi.fn(),
  editMessageCaption: vi.fn(),
  editMessageMedia: vi.fn()
}));

import { prisma } from '@/lib/prisma';
import { requireAuth, requireEditPermission } from '@/lib/auth';
import { editMessageText } from '@/lib/telegram/botApi';
import { GET as versionsGET, POST as versionsPOST } from '@/app/api/versions/recipe/[telegram_id]/route';
import { POST as restorePOST } from '@/app/api/versions/recipe/[telegram_id]/restore/[versionId]/route';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const requireAuthMock = vi.mocked(requireAuth);
const requireEditPermissionMock = vi.mocked(requireEditPermission);
const editMessageTextMock = vi.mocked(editMessageText);

const VIEWER_SESSION = {
  ok: true as const,
  session: { sub: '222', type: 'guest' as const, permissions: { can_edit: false } }
};
const EDITOR_SESSION = {
  ok: true as const,
  session: { sub: '111', type: 'telegram' as const, permissions: { can_edit: true } }
};

function getRequest(url: string): NextRequest {
  return new NextRequest(new URL(url), { method: 'GET' } as any);
}
function postRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  } as any);
}

function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    telegram_id: 555,
    title: 'נוכחי',
    raw_content: 'כותרת: נוכחי',
    categories: null,
    ingredients: null,
    instructions: null,
    preparation_time: null,
    difficulty: null,
    image_url: null,
    sync_status: 'synced',
    sync_error: null,
    ...overrides
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  requireAuthMock.mockReset();
  requireEditPermissionMock.mockReset();
  editMessageTextMock.mockReset();
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';
  requireAuthMock.mockResolvedValue(VIEWER_SESSION as any);
  requireEditPermissionMock.mockResolvedValue(EDITOR_SESSION as any);
  (prismaMock.$transaction as any).mockImplementation((cb: any) => cb(prismaMock));
});

describe('GET /api/versions/recipe/:telegram_id', () => {
  it('404s when the recipe is missing', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue(null);

    const response = await versionsGET(getRequest('http://localhost:3000/api/versions/recipe/555'), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(404);
  });

  it('returns a bare JSON array (not wrapped in { data }), newest first', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue({ id: 1 } as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([
      {
        id: 10,
        version_num: 2,
        content: {
          title: 'ב',
          raw_content: 'כותרת: ב',
          categories: ['a'],
          ingredients: ['x'],
          instructions: 'y',
          parsed_data: { preparation_time: 15, difficulty: 'EASY' }
        },
        created_at: new Date('2026-01-01T00:00:00Z'),
        created_by: '111',
        change_description: 'Recipe update',
        is_current: true
      }
    ] as any);

    const response = await versionsGET(getRequest('http://localhost:3000/api/versions/recipe/555'), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json[0]).toMatchObject({
      id: 10,
      version_num: 2,
      is_current: true,
      preparation_time: 15,
      difficulty: 'EASY',
      content: { title: 'ב', categories: ['a'], ingredients: ['x'] }
    });
    // cleanup runs on every GET, matching Flask's recipe.cleanup_versions().
    expect(prismaMock.recipeVersion.findMany).toHaveBeenCalled();
  });
});

describe('POST /api/versions/recipe/:telegram_id (create version)', () => {
  it('requires edit permission', async () => {
    requireEditPermissionMock.mockResolvedValue({ ok: false, status: 403, message: 'nope' });

    const response = await versionsPOST(
      postRequest('http://localhost:3000/api/versions/recipe/555', { content: { title: 'x' } }),
      { params: { telegram_id: '555' } }
    );

    expect(response.status).toBe(403);
  });

  it('stores the client-supplied content as-is and returns the full list', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue({ id: 1 } as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: 1 } } as any);

    const response = await versionsPOST(
      postRequest('http://localhost:3000/api/versions/recipe/555', {
        content: { title: 'ידני', raw_content: 'כותרת: ידני' },
        change_description: 'manual snapshot'
      }),
      { params: { telegram_id: '555' } }
    );

    expect(response.status).toBe(200);
    const createArgs = prismaMock.recipeVersion.create.mock.calls[0][0] as any;
    expect(createArgs.data.content).toEqual({ title: 'ידני', raw_content: 'כותרת: ידני' });
    expect(createArgs.data.version_num).toBe(2);
    expect(createArgs.data.is_current).toBe(true);
  });
});

describe('POST /api/versions/recipe/:telegram_id/restore/:versionId', () => {
  function restoreRequest(telegramId: string, versionId: string) {
    return restorePOST(postRequest(`http://localhost:3000/api/versions/recipe/${telegramId}/restore/${versionId}`), {
      params: { telegram_id: telegramId, versionId }
    });
  }

  it('requires edit permission', async () => {
    requireEditPermissionMock.mockResolvedValue({ ok: false, status: 403, message: 'nope' });
    const response = await restoreRequest('555', '10');
    expect(response.status).toBe(403);
  });

  it('404s when the version does not belong to the recipe', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue(recipeRow() as any);
    prismaMock.recipeVersion.findUnique.mockResolvedValue({ id: 10, recipe_id: 999 } as any);

    const response = await restoreRequest('555', '10');
    expect(response.status).toBe(404);
  });

  it('returns the flat { message, title, details, image } shape and skips the write when content is identical', async () => {
    const recipe = recipeRow({ raw_content: 'כותרת: נוכחי', image_url: null });
    prismaMock.recipe.findFirst.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findUnique.mockResolvedValue({
      id: 10,
      recipe_id: 1,
      version_num: 3,
      content: { raw_content: 'כותרת: נוכחי', image_url: null }
    } as any);

    const response = await restoreRequest('555', '10');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      message: 'No changes needed - content is identical',
      title: 'נוכחי',
      details: 'כותרת: נוכחי',
      image: null
    });
    expect(editMessageTextMock).not.toHaveBeenCalled();
    expect(prismaMock.recipe.update).not.toHaveBeenCalled();
  });

  it('restores a differing version: snapshots current state, edits Telegram, updates the recipe', async () => {
    const recipe = recipeRow({ raw_content: 'כותרת: נוכחי' });
    prismaMock.recipe.findFirst.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findUnique.mockResolvedValue({
      id: 10,
      recipe_id: 1,
      version_num: 3,
      content: {
        raw_content:
          'כותרת: ישן יותר\nקטגוריות: עיקריות\nזמן הכנה: 10 דקות\nרמת קושי: קל\nרשימת מצרכים:\n- א\nהוראות הכנה:\nלבשל',
        image_url: null
      }
    } as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: 3 } } as any);
    editMessageTextMock.mockResolvedValue({ message_id: 555 } as any);
    prismaMock.recipe.update.mockResolvedValue({
      ...recipe,
      title: 'ישן יותר',
      raw_content: 'כותרת: ישן יותר',
      image_url: null
    } as any);

    const response = await restoreRequest('555', '10');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      message: 'Version restored successfully',
      title: 'ישן יותר',
      details: 'כותרת: ישן יותר',
      image: null
    });

    // The *pre-restore* state ("נוכחי") is what gets snapshotted, not the restored one.
    const versionArgs = prismaMock.recipeVersion.create.mock.calls[0][0] as any;
    expect(versionArgs.data.content.raw_content).toBe('כותרת: נוכחי');

    expect(editMessageTextMock).toHaveBeenCalled();
  });

  it('Telegram down: restore still commits and sync_status becomes pending_telegram', async () => {
    const recipe = recipeRow({ raw_content: 'כותרת: נוכחי' });
    prismaMock.recipe.findFirst.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findUnique.mockResolvedValue({
      id: 10,
      recipe_id: 1,
      version_num: 3,
      content: { raw_content: 'כותרת: ישן יותר', image_url: null }
    } as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: 3 } } as any);
    editMessageTextMock.mockRejectedValue(new Error('Network request failed'));
    prismaMock.recipe.update.mockResolvedValue({
      ...recipe,
      title: 'ישן יותר',
      raw_content: 'כותרת: ישן יותר',
      sync_status: 'pending_telegram'
    } as any);

    const response = await restoreRequest('555', '10');

    expect(response.status).toBe(200);
    const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(updateArgs.data.sync_status).toBe('pending_telegram');
    expect(updateArgs.data.sync_error).toContain('Network request failed');

    // Response is still the success shape — Telegram being down never fails the request.
    const json = await response.json();
    expect(json.message).toBe('Version restored successfully');
  });
});

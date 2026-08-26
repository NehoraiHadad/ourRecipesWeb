// @vitest-environment node
/**
 * Integration tests for PUT /api/recipes/:telegram_id.
 * Prisma is fully mocked — no real network, no real DB.
 *
 * With the main Telegram channel gone, `commitUpdate` is the whole write: a
 * `RecipeVersion` snapshot of the previous content, then the new content
 * committed onto the row, in one transaction. No mirror, no follow-up patch.
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
  return { ...actual, requireEditPermission: vi.fn() };
});

vi.mock('@vercel/blob', () => ({
  put: vi.fn()
}));

import { prisma } from '@/lib/prisma';
import { requireEditPermission } from '@/lib/auth';
import { put } from '@vercel/blob';
import { PUT } from '@/app/api/recipes/[telegram_id]/route';
import { recipeRowWithRelations } from '@tests/helpers/recipeFixtures';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const requireEditPermissionMock = vi.mocked(requireEditPermission);
const putMock = vi.mocked(put);

const EDITOR_SESSION = {
  ok: true as const,
  session: { sub: '111', type: 'telegram' as const, permissions: { can_edit: true } }
};

function putRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/recipes/555'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } as any);
}

function existingRecipe(overrides: Record<string, unknown> = {}) {
  return recipeRowWithRelations({ title: 'ישן', raw_content: 'כותרת: ישן', ...overrides });
}

/** The row `commitUpdate`'s transactional write returns. */
function updatedRow(overrides: Record<string, unknown> = {}) {
  return recipeRowWithRelations({ title: 'חדש', raw_content: NEW_TEXT, ...overrides });
}

const NEW_TEXT =
  'כותרת: חדש\nקטגוריות: עיקריות\nזמן הכנה: 20 דקות\nרמת קושי: קל\nרשימת מצרכים:\n- דבר אחד\nהוראות הכנה:\nלבשל';

beforeEach(() => {
  mockReset(prismaMock);
  requireEditPermissionMock.mockReset();
  putMock.mockReset();
  requireEditPermissionMock.mockResolvedValue(EDITOR_SESSION as any);
  // $transaction runs the callback against the same mock prisma client.
  (prismaMock.$transaction as any).mockImplementation((cb: any) => cb(prismaMock));
});

describe('PUT /api/recipes/:telegram_id', () => {
  it('rejects non-editors', async () => {
    requireEditPermissionMock.mockResolvedValue({
      ok: false,
      status: 403,
      message: 'User does not have edit permissions'
    });

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(403);
  });

  it('404s when the recipe does not exist', async () => {
    prismaMock.recipe.findFirst.mockResolvedValue(null);

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(404);
  });

  it('short-circuits (no version, no write) when content is unchanged', async () => {
    const recipe = existingRecipe({ raw_content: NEW_TEXT });
    prismaMock.recipe.findFirst.mockResolvedValue(recipe as any);

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(200);
    expect(prismaMock.recipeVersion.create).not.toHaveBeenCalled();
    expect(prismaMock.recipe.update).not.toHaveBeenCalled();
  });

  it('snapshots the previous content, then commits the new content in one write', async () => {
    const recipe = existingRecipe();
    prismaMock.recipe.findFirst.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
    prismaMock.recipe.update.mockResolvedValue(updatedRow() as any);

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(200);

    // Old content was snapshotted before the recipe row was overwritten.
    const versionArgs = prismaMock.recipeVersion.create.mock.calls[0][0] as any;
    expect(versionArgs.data.content.raw_content).toBe('כותרת: ישן');

    // The only write: new content, plus the conflict-tracking fields.
    expect(prismaMock.recipe.update).toHaveBeenCalledTimes(1);
    const commitArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(commitArgs.data.raw_content).toBe(NEW_TEXT);
    expect(commitArgs.data.app_edited_at).toBeInstanceOf(Date);
    expect(commitArgs.data.needs_review).toBe(false);

    const json = await response.json();
    expect(json.data.raw_content).toBe(NEW_TEXT);
  });

  it('keeps the existing image when no new one is supplied', async () => {
    const recipe = existingRecipe({ image_url: 'https://blob.example/existing.jpg' });
    prismaMock.recipe.findFirst.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
    prismaMock.recipe.update.mockResolvedValue(
      updatedRow({ image_url: 'https://blob.example/existing.jpg' }) as any
    );

    await PUT(putRequest({ newText: NEW_TEXT }), { params: { telegram_id: '555' } });

    expect(putMock).not.toHaveBeenCalled();
    const commitArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(commitArgs.data.image_url).toBe('https://blob.example/existing.jpg');
  });

  it('uploads a newly supplied image and stores its URL on the row', async () => {
    const recipe = existingRecipe({ image_url: 'https://blob.example/old.jpg' });
    prismaMock.recipe.findFirst.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
    putMock.mockResolvedValue({ url: 'https://blob.example/new.jpg' } as any);
    prismaMock.recipe.update.mockResolvedValue(updatedRow({ image_url: 'https://blob.example/new.jpg' }) as any);

    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    await PUT(putRequest({ newText: NEW_TEXT, image: `data:image/png;base64,${tinyPngBase64}` }), {
      params: { telegram_id: '555' }
    });

    expect(putMock).toHaveBeenCalled();
    const commitArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(commitArgs.data.image_url).toBe('https://blob.example/new.jpg');
  });
});

// @vitest-environment node
/**
 * Integration tests for PUT /api/recipes/:telegram_id (Wave 1.B).
 * Prisma and Telegram are fully mocked — no real network, no real DB.
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

vi.mock('@/lib/telegram/botApi', () => ({
  editMessageText: vi.fn(),
  editMessageCaption: vi.fn(),
  editMessageMedia: vi.fn()
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn()
}));

import { prisma } from '@/lib/prisma';
import { requireEditPermission } from '@/lib/auth';
import { editMessageText, editMessageCaption, editMessageMedia } from '@/lib/telegram/botApi';
import { put } from '@vercel/blob';
import { PUT } from '@/app/api/recipes/[telegram_id]/route';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const requireEditPermissionMock = vi.mocked(requireEditPermission);
const editMessageTextMock = vi.mocked(editMessageText);
const editMessageCaptionMock = vi.mocked(editMessageCaption);
const editMessageMediaMock = vi.mocked(editMessageMedia);
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
  return {
    id: 1,
    telegram_id: 555,
    title: 'ישן',
    raw_content: 'כותרת: ישן',
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

const NEW_TEXT =
  'כותרת: חדש\nקטגוריות: עיקריות\nזמן הכנה: 20 דקות\nרמת קושי: קל\nרשימת מצרכים:\n- דבר אחד\nהוראות הכנה:\nלבשל';

beforeEach(() => {
  mockReset(prismaMock);
  requireEditPermissionMock.mockReset();
  editMessageTextMock.mockReset();
  editMessageCaptionMock.mockReset();
  editMessageMediaMock.mockReset();
  putMock.mockReset();
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';
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
    prismaMock.recipe.findUnique.mockResolvedValue(null);

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(404);
  });

  it('short-circuits (no version, no Telegram call) when content is unchanged', async () => {
    const recipe = existingRecipe({ raw_content: NEW_TEXT });
    prismaMock.recipe.findUnique.mockResolvedValue(recipe as any);

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(200);
    expect(editMessageTextMock).not.toHaveBeenCalled();
    expect(prismaMock.recipeVersion.create).not.toHaveBeenCalled();
    expect(prismaMock.recipe.update).not.toHaveBeenCalled();
  });

  it('snapshots the previous content as a version, edits the message, and marks synced', async () => {
    const recipe = existingRecipe();
    prismaMock.recipe.findUnique.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
    editMessageTextMock.mockResolvedValue({ message_id: 555 } as any);
    prismaMock.recipe.update.mockResolvedValue({ ...recipe, raw_content: NEW_TEXT, sync_status: 'synced' } as any);

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(200);
    expect(editMessageTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ message_id: 555, text: NEW_TEXT })
    );

    // Old content was snapshotted before the recipe row was overwritten.
    const versionArgs = prismaMock.recipeVersion.create.mock.calls[0][0] as any;
    expect(versionArgs.data.content.raw_content).toBe('כותרת: ישן');

    const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(updateArgs.data.raw_content).toBe(NEW_TEXT);
    expect(updateArgs.data.sync_status).toBe('synced');
    expect(updateArgs.data.sync_error).toBeNull();
  });

  it('Telegram down: the update still succeeds and sync_status becomes pending_telegram', async () => {
    const recipe = existingRecipe();
    prismaMock.recipe.findUnique.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
    editMessageTextMock.mockRejectedValue(new Error('Telegram editMessageText failed (0): Network request failed'));
    prismaMock.recipe.update.mockResolvedValue({
      ...recipe,
      raw_content: NEW_TEXT,
      sync_status: 'pending_telegram',
      sync_error: 'Network request failed'
    } as any);

    const response = await PUT(putRequest({ newText: NEW_TEXT }), {
      params: { telegram_id: '555' }
    });

    expect(response.status).toBe(200);

    const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(updateArgs.data.sync_status).toBe('pending_telegram');
    expect(updateArgs.data.sync_error).toContain('Network request failed');

    const json = await response.json();
    expect(json.data.sync_status).toBe('pending_telegram');
  });

  it('uses editMessageCaption when the message already has a photo and only the text changes', async () => {
    const recipe = existingRecipe({ image_url: 'https://blob.example/existing.jpg' });
    prismaMock.recipe.findUnique.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
    editMessageCaptionMock.mockResolvedValue({ message_id: 555 } as any);
    prismaMock.recipe.update.mockResolvedValue({ ...recipe, raw_content: NEW_TEXT } as any);

    await PUT(putRequest({ newText: NEW_TEXT }), { params: { telegram_id: '555' } });

    expect(editMessageCaptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ message_id: 555, caption: NEW_TEXT })
    );
    expect(editMessageTextMock).not.toHaveBeenCalled();
    expect(editMessageMediaMock).not.toHaveBeenCalled();
  });

  it('uploads a new image and calls editMessageMedia when a fresh image is supplied', async () => {
    const recipe = existingRecipe({ image_url: 'https://blob.example/old.jpg' });
    prismaMock.recipe.findUnique.mockResolvedValue(recipe as any);
    prismaMock.recipeVersion.findMany.mockResolvedValue([]);
    prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
    putMock.mockResolvedValue({ url: 'https://blob.example/new.jpg' } as any);
    editMessageMediaMock.mockResolvedValue({ message_id: 555 } as any);
    prismaMock.recipe.update.mockResolvedValue({ ...recipe, image_url: 'https://blob.example/new.jpg' } as any);

    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    await PUT(putRequest({ newText: NEW_TEXT, image: `data:image/png;base64,${tinyPngBase64}` }), {
      params: { telegram_id: '555' }
    });

    expect(editMessageMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message_id: 555,
        media: expect.objectContaining({ media: 'https://blob.example/new.jpg' })
      })
    );

    const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(updateArgs.data.image_url).toBe('https://blob.example/new.jpg');
  });
});

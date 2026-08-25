// @vitest-environment node
/**
 * Integration tests for POST /api/recipes (Wave 1.B).
 * Prisma and Telegram are fully mocked — no real network, no real DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: mockDeep<PrismaClient>()
}));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, requireEditPermission: vi.fn() };
});

vi.mock('@/lib/telegram/botApi', () => ({
  sendMessage: vi.fn(),
  sendPhoto: vi.fn()
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn()
}));

import { prisma } from '@/lib/prisma';
import { requireEditPermission } from '@/lib/auth';
import { sendMessage, sendPhoto } from '@/lib/telegram/botApi';
import { put } from '@vercel/blob';
import { POST } from '@/app/api/recipes/route';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const requireEditPermissionMock = vi.mocked(requireEditPermission);
const sendMessageMock = vi.mocked(sendMessage);
const sendPhotoMock = vi.mocked(sendPhoto);
const putMock = vi.mocked(put);

const EDITOR_SESSION = {
  ok: true as const,
  session: { sub: '111', type: 'telegram' as const, permissions: { can_edit: true } }
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/recipes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } as any);
}

function fakeRecipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    telegram_id: 555,
    title: 'עוגת שוקולד',
    raw_content: 'כותרת: עוגת שוקולד',
    sync_status: 'synced',
    sync_error: null,
    versions: [],
    user_recipes: [],
    ...overrides
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  requireEditPermissionMock.mockReset();
  sendMessageMock.mockReset();
  sendPhotoMock.mockReset();
  putMock.mockReset();
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';
  requireEditPermissionMock.mockResolvedValue(EDITOR_SESSION as any);
});

const VALID_BODY = {
  newText:
    'כותרת: עוגת שוקולד\nקטגוריות: קינוחים\nזמן הכנה: 45 דקות\nרמת קושי: קל\nרשימת מצרכים:\n- ביצים\nהוראות הכנה:\nלערבב הכל'
};

describe('POST /api/recipes', () => {
  it('rejects unauthenticated / non-editor callers', async () => {
    requireEditPermissionMock.mockResolvedValue({
      ok: false,
      status: 403,
      message: 'User does not have edit permissions'
    });

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(403);
    expect(prismaMock.recipe.create).not.toHaveBeenCalled();
  });

  it('rejects a body with no text', async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
    expect(prismaMock.recipe.create).not.toHaveBeenCalled();
  });

  it('creates the recipe with the real Telegram message id when the mirror succeeds', async () => {
    sendMessageMock.mockResolvedValue({ message_id: 4242 } as any);
    prismaMock.recipe.create.mockResolvedValue(fakeRecipeRow({ telegram_id: 4242 }) as any);

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: -1001234567890, text: VALID_BODY.newText })
    );

    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.telegram_id).toBe(4242);
    expect(createArgs.data.sync_status).toBe('synced');
    expect(createArgs.data.sync_error).toBeNull();
    expect(createArgs.data.title).toBe('עוגת שוקולד');
    expect(createArgs.data.versions.create.is_current).toBe(true);

    const json = await response.json();
    expect(json.data.telegram_id).toBe(4242);
  });

  it('sends a photo instead of a text message when an image is supplied', async () => {
    sendPhotoMock.mockResolvedValue({ message_id: 777 } as any);
    putMock.mockResolvedValue({ url: 'https://blob.example/recipes/create.jpg' } as any);
    prismaMock.recipe.create.mockResolvedValue(fakeRecipeRow({ telegram_id: 777 }) as any);

    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    await POST(
      postRequest({ ...VALID_BODY, image: `data:image/png;base64,${tinyPngBase64}` })
    );

    expect(sendPhotoMock).toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(putMock).toHaveBeenCalled();

    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.image_url).toBe('https://blob.example/recipes/create.jpg');
  });

  it('Telegram down: still creates the recipe, with a negative placeholder id and pending_telegram', async () => {
    sendMessageMock.mockRejectedValue(new Error('Telegram sendMessage failed (0): Network request failed'));
    prismaMock.recipe.create.mockResolvedValue(fakeRecipeRow({ telegram_id: -123, sync_status: 'pending_telegram' }) as any);

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);

    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.telegram_id).toBeLessThan(0);
    expect(Number.isSafeInteger(createArgs.data.telegram_id)).toBe(true);
    expect(createArgs.data.sync_status).toBe('pending_telegram');
    expect(createArgs.data.sync_error).toContain('Network request failed');
  });

  it('retries with a fresh placeholder id on a unique-constraint collision', async () => {
    sendMessageMock.mockRejectedValue(new Error('down'));

    const collision = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on telegram_id', {
      code: 'P2002',
      clientVersion: '6.0.0'
    });

    prismaMock.recipe.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce(fakeRecipeRow({ telegram_id: -999, sync_status: 'pending_telegram' }) as any);

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(prismaMock.recipe.create).toHaveBeenCalledTimes(2);
    const [firstCallId, secondCallId] = prismaMock.recipe.create.mock.calls.map(
      (call: any) => call[0].data.telegram_id
    );
    expect(firstCallId).not.toBe(secondCallId);
  });

  it('builds the canonical text via formatRecipeText when only structured fields are given', async () => {
    sendMessageMock.mockResolvedValue({ message_id: 88 } as any);
    prismaMock.recipe.create.mockResolvedValue(fakeRecipeRow({ telegram_id: 88 }) as any);

    await POST(
      postRequest({
        title: 'מרק עדשים',
        categories: ['מרקים'],
        ingredients: ['עדשים', 'בצל'],
        instructions: 'לבשל הכל',
        preparationTime: 40,
        difficulty: 'EASY'
      })
    );

    const sentText = sendMessageMock.mock.calls[0][0].text as string;
    expect(sentText).toContain('כותרת: מרק עדשים');
    expect(sentText).toContain('רשימת מצרכים:');
    expect(sentText).toContain('- עדשים');
  });
});

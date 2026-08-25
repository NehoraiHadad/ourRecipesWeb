// @vitest-environment node
/**
 * Integration tests for POST /api/recipes (Wave 1.B, Stage H1: DB-first).
 * Prisma and Telegram are fully mocked — no real network, no real DB.
 *
 * Stage H1 flips the write order: the DB row is created first, under a
 * placeholder negative `telegram_id` and `sync_status: 'pending_telegram'`
 * (`prisma.recipe.create`), and only afterwards is the Telegram mirror
 * attempted — the outcome is applied with a second write
 * (`prisma.recipe.update`).
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
import { recipeRowWithRelations } from '@tests/helpers/recipeFixtures';

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

const fakeRecipeRow = recipeRowWithRelations;

/** The row `prisma.recipe.create` returns: always pending, negative placeholder id. */
function pendingRow(overrides: Record<string, unknown> = {}) {
  return fakeRecipeRow({ telegram_id: -999, sync_status: 'pending_telegram', sync_error: null, ...overrides });
}

beforeEach(() => {
  mockReset(prismaMock);
  requireEditPermissionMock.mockReset();
  sendMessageMock.mockReset();
  sendPhotoMock.mockReset();
  putMock.mockReset();
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';
  requireEditPermissionMock.mockResolvedValue(EDITOR_SESSION as any);
  prismaMock.recipe.create.mockResolvedValue(pendingRow() as any);
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

  it('writes the DB row pending, before the Telegram mirror is attempted', async () => {
    sendMessageMock.mockResolvedValue({ message_id: 4242 } as any);
    prismaMock.recipe.update.mockResolvedValue(pendingRow({ telegram_id: 4242, sync_status: 'synced' }) as any);

    await POST(postRequest(VALID_BODY));

    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.telegram_id).toBeLessThan(0);
    expect(createArgs.data.sync_status).toBe('pending_telegram');
    expect(createArgs.data.sync_error).toBeNull();
    expect(createArgs.data.title).toBe('עוגת שוקולד');
    expect(createArgs.data.versions.create.is_current).toBe(true);

    // The DB write happens first — the mirror attempt only comes after.
    const createCallOrder = prismaMock.recipe.create.mock.invocationCallOrder[0];
    const mirrorCallOrder = sendMessageMock.mock.invocationCallOrder[0];
    expect(createCallOrder).toBeLessThan(mirrorCallOrder);
  });

  it('patches the row to synced with the real telegram_id when the mirror succeeds', async () => {
    sendMessageMock.mockResolvedValue({ message_id: 4242 } as any);
    prismaMock.recipe.update.mockResolvedValue(pendingRow({ telegram_id: 4242, sync_status: 'synced' }) as any);

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: -1001234567890, text: VALID_BODY.newText })
    );

    const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(updateArgs.data.telegram_id).toBe(4242);
    expect(updateArgs.data.sync_status).toBe('synced');
    expect(updateArgs.data.sync_error).toBeNull();
    expect(updateArgs.data.last_sync).toBeInstanceOf(Date);

    const json = await response.json();
    expect(json.data.telegram_id).toBe(4242);
  });

  it('sends a photo instead of a text message when an image is supplied', async () => {
    sendPhotoMock.mockResolvedValue({ message_id: 777 } as any);
    putMock.mockResolvedValue({ url: 'https://blob.example/recipes/create.jpg' } as any);
    prismaMock.recipe.update.mockResolvedValue(pendingRow({ telegram_id: 777, sync_status: 'synced' }) as any);

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

  it('Telegram down: still creates the recipe and returns success with sync_status pending_telegram', async () => {
    sendMessageMock.mockRejectedValue(new Error('Telegram sendMessage failed (0): Network request failed'));
    prismaMock.recipe.update.mockResolvedValue(
      pendingRow({ sync_error: 'Telegram sendMessage failed (0): Network request failed' }) as any
    );

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);

    // The create write is unaffected by the mirror outcome — always pending.
    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.telegram_id).toBeLessThan(0);
    expect(Number.isSafeInteger(createArgs.data.telegram_id)).toBe(true);
    expect(createArgs.data.sync_status).toBe('pending_telegram');

    // The failure is recorded on the follow-up patch instead.
    const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(updateArgs.data.sync_error).toContain('Network request failed');
    expect(updateArgs.data.telegram_id).toBeUndefined();

    const json = await response.json();
    expect(json.data.sync_status).toBe('pending_telegram');
  });

  it('retries with a fresh placeholder id on a unique-constraint collision', async () => {
    sendMessageMock.mockRejectedValue(new Error('down'));

    const collision = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on telegram_id', {
      code: 'P2002',
      clientVersion: '6.0.0'
    });

    prismaMock.recipe.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce(pendingRow({ telegram_id: -999 }) as any);
    prismaMock.recipe.update.mockResolvedValue(pendingRow({ telegram_id: -999, sync_error: 'down' }) as any);

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
    prismaMock.recipe.update.mockResolvedValue(pendingRow({ telegram_id: 88, sync_status: 'synced' }) as any);

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

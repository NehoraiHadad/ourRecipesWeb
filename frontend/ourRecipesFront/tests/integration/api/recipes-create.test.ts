// @vitest-environment node
/**
 * Integration tests for POST /api/recipes.
 * Prisma is fully mocked — no real network, no real DB.
 *
 * With the main Telegram channel gone, the DB is the only store: the route
 * generates a permanent negative `telegram_id` and writes the recipe (+
 * initial version) in a single `prisma.recipe.create` — there is no mirror
 * step and no follow-up patch.
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

vi.mock('@vercel/blob', () => ({
  put: vi.fn()
}));

import { prisma } from '@/lib/prisma';
import { requireEditPermission } from '@/lib/auth';
import { put } from '@vercel/blob';
import { POST } from '@/app/api/recipes/route';
import { recipeRowWithRelations } from '@tests/helpers/recipeFixtures';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const requireEditPermissionMock = vi.mocked(requireEditPermission);
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

beforeEach(() => {
  mockReset(prismaMock);
  requireEditPermissionMock.mockReset();
  putMock.mockReset();
  requireEditPermissionMock.mockResolvedValue(EDITOR_SESSION as any);
  prismaMock.recipe.create.mockResolvedValue(fakeRecipeRow({ telegram_id: -4242 }) as any);
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

  it('creates the recipe with a freshly generated negative telegram_id, in one write', async () => {
    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);

    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.telegram_id).toBeLessThan(0);
    expect(Number.isSafeInteger(createArgs.data.telegram_id)).toBe(true);
    expect(createArgs.data.title).toBe('עוגת שוקולד');
    expect(createArgs.data.versions.create.is_current).toBe(true);

    // No follow-up patch — the create call is the whole write.
    expect(prismaMock.recipe.update).not.toHaveBeenCalled();

    const json = await response.json();
    expect(json.data.telegram_id).toBe(-4242);
  });

  it('uploads a supplied image to Blob and stores its URL on the row', async () => {
    putMock.mockResolvedValue({ url: 'https://blob.example/recipes/create.jpg' } as any);
    prismaMock.recipe.create.mockResolvedValue(
      fakeRecipeRow({ telegram_id: -777, image_url: 'https://blob.example/recipes/create.jpg' }) as any
    );

    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    await POST(postRequest({ ...VALID_BODY, image: `data:image/png;base64,${tinyPngBase64}` }));

    expect(putMock).toHaveBeenCalled();

    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.image_url).toBe('https://blob.example/recipes/create.jpg');
  });

  it('retries with a fresh id on a unique-constraint collision', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on telegram_id', {
      code: 'P2002',
      clientVersion: '6.0.0'
    });

    prismaMock.recipe.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce(fakeRecipeRow({ telegram_id: -999 }) as any);

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(prismaMock.recipe.create).toHaveBeenCalledTimes(2);
    const [firstCallId, secondCallId] = prismaMock.recipe.create.mock.calls.map(
      (call: any) => call[0].data.telegram_id
    );
    expect(firstCallId).not.toBe(secondCallId);
  });

  it('builds the canonical text via formatRecipeText when only structured fields are given', async () => {
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

    const createArgs = prismaMock.recipe.create.mock.calls[0][0] as any;
    expect(createArgs.data.raw_content).toContain('כותרת: מרק עדשים');
    expect(createArgs.data.raw_content).toContain('רשימת מצרכים:');
    expect(createArgs.data.raw_content).toContain('- עדשים');
  });
});

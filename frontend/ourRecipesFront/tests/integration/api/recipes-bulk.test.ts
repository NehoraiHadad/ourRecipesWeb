// @vitest-environment node
/**
 * Integration tests for POST /api/recipes/bulk.
 *
 * With the main Telegram channel gone, a recipe's reformat + DB commit is
 * its whole outcome — no mirror step, so nothing here mocks `botApi`.
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

vi.mock('@/lib/services/aiService', () => ({
  reformatRecipe: vi.fn()
}));

import { prisma } from '@/lib/prisma';
import { requireEditPermission } from '@/lib/auth';
import { reformatRecipe } from '@/lib/services/aiService';
import { POST } from '@/app/api/recipes/bulk/route';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
const requireEditPermissionMock = vi.mocked(requireEditPermission);
const reformatRecipeMock = vi.mocked(reformatRecipe);

const EDITOR_SESSION = {
  ok: true as const,
  session: { sub: '111', type: 'telegram' as const, permissions: { can_edit: true } }
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/recipes/bulk'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } as any);
}

function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    telegram_id: 100,
    title: 'ישן',
    raw_content: 'כותרת: ישן',
    categories: null,
    ingredients: null,
    instructions: null,
    preparation_time: null,
    difficulty: null,
    image_url: null,
    ...overrides
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  requireEditPermissionMock.mockReset();
  reformatRecipeMock.mockReset();
  requireEditPermissionMock.mockResolvedValue(EDITOR_SESSION as any);
  (prismaMock.$transaction as any).mockImplementation((cb: any) => cb(prismaMock));
  prismaMock.recipeVersion.findMany.mockResolvedValue([]);
  prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as any);
});

describe('POST /api/recipes/bulk', () => {
  it('rejects non-editors', async () => {
    requireEditPermissionMock.mockResolvedValue({ ok: false, status: 403, message: 'nope' });

    const response = await POST(postRequest({ action: 'parse', recipeIds: [1] }));
    expect(response.status).toBe(403);
  });

  it('rejects an unsupported action', async () => {
    const response = await POST(postRequest({ action: 'delete', recipeIds: [1] }));
    expect(response.status).toBe(400);
  });

  it('reformats + updates each recipe and reports processed/failed/total (flat, unwrapped)', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([recipeRow({ id: 1 }), recipeRow({ id: 2, telegram_id: 200 })] as any);
    reformatRecipeMock.mockResolvedValue('כותרת: מפורסר\nרשימת מצרכים:\n- א\nהוראות הכנה:\nלבשל');
    prismaMock.recipe.update.mockResolvedValue({} as any);

    const response = await POST(postRequest({ action: 'parse', recipeIds: [1, 2] }));

    expect(response.status).toBe(200);
    const json = await response.json();
    // UI reads result.processed directly (RecipeManagement.handleBulkAction) — must not be wrapped in { data }.
    expect(json).toEqual({ processed: 2, failed: 0, total: 2, remaining: 0 });
    expect(reformatRecipeMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.recipe.update).toHaveBeenCalledTimes(2);

    const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
    expect(updateArgs.data.raw_content).toContain('מפורסר');
  });

  it('counts a recipe missing raw_content as failed without calling the AI service', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([recipeRow({ id: 1, raw_content: '' })] as any);

    const response = await POST(postRequest({ action: 'parse', recipeIds: [1] }));

    const json = await response.json();
    expect(json).toEqual({ processed: 0, failed: 1, total: 1, remaining: 0 });
    expect(reformatRecipeMock).not.toHaveBeenCalled();
  });

  it('counts a recipe as failed when AI reformatting throws, and continues with the rest', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      recipeRow({ id: 1 }),
      recipeRow({ id: 2, telegram_id: 200 })
    ] as any);
    reformatRecipeMock
      .mockRejectedValueOnce(new Error('AI service down'))
      .mockResolvedValueOnce('כותרת: מפורסר\nרשימת מצרכים:\n- א\nהוראות הכנה:\nלבשל');
    prismaMock.recipe.update.mockResolvedValue({} as any);

    const response = await POST(postRequest({ action: 'parse', recipeIds: [1, 2] }));

    const json = await response.json();
    expect(json).toEqual({ processed: 1, failed: 1, total: 2, remaining: 0 });
  });
});

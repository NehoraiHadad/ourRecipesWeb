// @vitest-environment node
/**
 * The deadline half of {@link bulkParseRecipes}.
 *
 * Regression for a production 504: the bulk route declared no `maxDuration`,
 * inherited the project's 15s default, and was killed after reformatting one
 * of two recipes — the client saw only "Network response was not ok" and had
 * no way to know the first recipe had already been rewritten.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({ prisma: mockDeep<PrismaClient>() }));
vi.mock('@/lib/services/aiService', () => ({ reformatRecipe: vi.fn() }));
vi.mock('@/lib/recipes/mirror', () => ({ mirrorEditRecipe: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { reformatRecipe } from '@/lib/services/aiService';
import { mirrorEditRecipe } from '@/lib/recipes/mirror';
import { bulkParseRecipes } from '@/lib/recipes/bulkParse';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

function recipeRow(id: number) {
  return {
    id,
    telegram_id: 100 + id,
    title: 'ישן',
    raw_content: 'כותרת: ישן',
    categories: null,
    ingredients_list: null,
    instructions: null,
    preparation_time: null,
    difficulty: null,
    image_url: null
  };
}

/** Far enough ahead that the per-recipe budget never trips. */
const GENEROUS = () => Date.now() + 600_000;

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(reformatRecipe).mockReset();
  vi.mocked(mirrorEditRecipe).mockReset();
  (prismaMock.$transaction as any).mockImplementation((cb: any) => cb(prismaMock));
  prismaMock.recipeVersion.findMany.mockResolvedValue([] as never);
  prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: null } } as never);
  prismaMock.recipe.update.mockResolvedValue({} as never);
  vi.mocked(reformatRecipe).mockResolvedValue('כותרת: מפורסר\nרשימת מצרכים:\n- א\nהוראות הכנה:\nלבשל');
  vi.mocked(mirrorEditRecipe).mockResolvedValue({ syncStatus: 'synced', syncError: null } as never);
});

describe('bulkParseRecipes', () => {
  it('stops before the deadline and reports what is left instead of being killed', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([recipeRow(1), recipeRow(2), recipeRow(3)] as never);

    // A deadline already in the past: not even the first recipe fits.
    const result = await bulkParseRecipes([1, 2, 3], Date.now() - 1);

    expect(result).toEqual({ processed: 0, failed: 0, remaining: 3, total: 3 });
    // The point of stopping early — no AI spend on work that cannot be committed.
    expect(reformatRecipe).not.toHaveBeenCalled();
  });

  it('processes the whole batch when the budget allows, reporting nothing remaining', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([recipeRow(1), recipeRow(2)] as never);

    const result = await bulkParseRecipes([1, 2], GENEROUS());

    expect(result).toEqual({ processed: 2, failed: 0, remaining: 0, total: 2 });
    expect(reformatRecipe).toHaveBeenCalledTimes(2);
  });

  it('runs recipes concurrently rather than one at a time', async () => {
    prismaMock.recipe.findMany.mockResolvedValue(
      [1, 2, 3, 4].map(recipeRow) as never
    );

    let inFlight = 0;
    let peak = 0;
    vi.mocked(reformatRecipe).mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return 'כותרת: מפורסר\nרשימת מצרכים:\n- א\nהוראות הכנה:\nלבשל';
    });

    const result = await bulkParseRecipes([1, 2, 3, 4], GENEROUS());

    expect(result.processed).toBe(4);
    // Sequential would peak at 1. The cap is Telegram's edit limit, not the model's.
    expect(peak).toBeGreaterThan(1);
  });

  it('keeps the rest of a wave when one recipe throws', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([1, 2, 3].map(recipeRow) as never);
    vi.mocked(reformatRecipe)
      .mockRejectedValueOnce(new Error('AI service down'))
      .mockResolvedValue('כותרת: מפורסר\nרשימת מצרכים:\n- א\nהוראות הכנה:\nלבשל');

    const result = await bulkParseRecipes([1, 2, 3], GENEROUS());

    expect(result).toEqual({ processed: 2, failed: 1, remaining: 0, total: 3 });
  });

  it('only reparses visible recipes, so a deleted one is never rewritten', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([] as never);

    await bulkParseRecipes([1], GENEROUS());

    expect(prismaMock.recipe.findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'ACTIVE', id: { in: [1] } }
    });
  });
});

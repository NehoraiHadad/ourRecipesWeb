// @vitest-environment node
/**
 * Regression for "מתכון לא זמין" on every previewed course: the preview used
 * to hand the client the agent's plan (bare recipe ids), while the UI renders
 * the same embedded recipe summary a saved menu carries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({ prisma: mockDeep<PrismaClient>() }));

import { prisma } from '@/lib/prisma';
import { buildMenuPreview } from '@/lib/menus/menuPreview';
import type { MenuPlan } from '@/lib/ai/menu/types';

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

const PLAN: MenuPlan = {
  reasoning: 'תפריט מאוזן לשבת',
  meals: [
    {
      meal_type: 'ארוחת ערב שבת',
      meal_order: 1,
      recipes: [
        { recipe_id: 11, course_type: 'מנה ראשונה', course_order: 1, ai_reason: 'פתיחה קלילה' },
        { recipe_id: 22, course_type: 'מנה עיקרית', course_order: 2, ai_reason: 'מנה בשרית' }
      ]
    }
  ]
};

beforeEach(() => {
  mockReset(prismaMock);
});

describe('buildMenuPreview', () => {
  it('embeds a recipe summary per course and renames reasoning to the canonical field', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      {
        id: 11,
        telegram_id: 211,
        title: 'סלט חצילים',
        cooking_time: 20,
        preparation_time: 10,
        difficulty: 'EASY',
        servings: 4,
        image_url: 'https://blob/1.jpg'
      },
      {
        id: 22,
        telegram_id: 222,
        title: 'צלי בקר',
        cooking_time: 180,
        preparation_time: 30,
        difficulty: 'MEDIUM',
        servings: 6,
        image_url: null
      }
    ] as never);

    const preview = await buildMenuPreview(PLAN);

    expect(preview.ai_reasoning).toBe('תפריט מאוזן לשבת');
    const [first, second] = preview.meals[0].recipes;
    expect(first.recipe).toEqual({
      id: 11,
      telegram_id: 211,
      title: 'סלט חצילים',
      cooking_time: 20,
      preparation_time: 10,
      // lowercase, like the saved-menu serializer emits
      difficulty: 'easy',
      servings: 4,
      image_url: 'https://blob/1.jpg'
    });
    // The planner's own fields survive alongside the summary.
    expect(first.course_type).toBe('מנה ראשונה');
    expect(first.ai_reason).toBe('פתיחה קלילה');
    expect(second.recipe?.title).toBe('צלי בקר');
    expect(second.recipe?.image_url).toBeUndefined();
  });

  it('queries each referenced recipe once', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([] as never);

    await buildMenuPreview({
      ...PLAN,
      meals: [{ ...PLAN.meals[0], recipes: [...PLAN.meals[0].recipes, PLAN.meals[0].recipes[0]] }]
    });

    expect(prismaMock.recipe.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.recipe.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: [11, 22] } } });
  });

  it('leaves a course without a summary when the agent invents a recipe id', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([] as never);

    const preview = await buildMenuPreview(PLAN);

    expect(preview.meals[0].recipes.every((course) => course.recipe === undefined)).toBe(true);
    // The ids still reach the save route, which skips the invalid ones.
    expect(preview.meals[0].recipes.map((c) => c.recipe_id)).toEqual([11, 22]);
  });
});

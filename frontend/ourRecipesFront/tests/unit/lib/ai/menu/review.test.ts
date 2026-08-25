// @vitest-environment node
/**
 * `review_menu_draft` is the agent's feedback loop — it has to be strict
 * enough to be worth a round trip and specific enough to act on.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { reviewMenuDraft } from '@/lib/ai/menu/review';

function dbRecipe(id: number, title: string, ingredients: string[]) {
  return { id, title, ingredients_list: ingredients.map((name) => ({ name })) };
}

const GOOD_DRAFT = {
  meals: [
    {
      meal_type: 'ארוחת ערב',
      recipes: [
        { recipe_id: 1, course_type: 'ראשונה' },
        { recipe_id: 2, course_type: 'מנה עיקרית' }
      ]
    }
  ]
};

beforeEach(() => {
  resetPrismaMock();
});

describe('reviewMenuDraft', () => {
  it('approves a draft with a main course, no repeats and no shared ingredients', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      dbRecipe(1, 'סלט ירקות', ['חסה', 'עגבנייה']),
      dbRecipe(2, 'עוף בתנור', ['עוף', 'לימון'])
    ] as never);

    expect(await reviewMenuDraft(GOOD_DRAFT)).toEqual({ ok: true, issues: [] });
  });

  it('rejects an empty draft without touching the database', async () => {
    const result = await reviewMenuDraft({ meals: [] });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain('הטיוטה ריקה');
    expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
  });

  it('flags a recipe id that is missing or not ACTIVE', async () => {
    // Only recipe 1 comes back — 2 is deleted or unparsed.
    prismaMock.recipe.findMany.mockResolvedValue([
      dbRecipe(1, 'סלט ירקות', ['חסה'])
    ] as never);

    const result = await reviewMenuDraft(GOOD_DRAFT);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.stringContaining('המתכון 2 לא קיים במאגר'));
  });

  it('flags a meal with no main course', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      dbRecipe(1, 'סלט ירקות', ['חסה']),
      dbRecipe(2, 'עוגת שוקולד', ['שוקולד'])
    ] as never);

    const result = await reviewMenuDraft({
      meals: [
        {
          meal_type: 'ארוחת ערב',
          recipes: [
            { recipe_id: 1, course_type: 'ראשונה' },
            { recipe_id: 2, course_type: 'קינוח' }
          ]
        }
      ]
    });

    expect(result.issues).toContainEqual('בארוחה "ארוחת ערב" אין מנה עיקרית');
  });

  it('flags the same recipe used twice anywhere in the menu', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      dbRecipe(1, 'עוף בתנור', ['עוף'])
    ] as never);

    const result = await reviewMenuDraft({
      meals: [
        { meal_type: 'צהריים', recipes: [{ recipe_id: 1, course_type: 'עיקרית' }] },
        { meal_type: 'ערב', recipes: [{ recipe_id: 1, course_type: 'עיקרית' }] }
      ]
    });

    expect(result.issues).toContainEqual(
      'המתכון "עוף בתנור" מופיע יותר מפעם אחת בתפריט'
    );
  });

  it('flags two courses of one meal leaning on the same ingredient', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      dbRecipe(1, 'סלט חצילים', ['חציל', 'טחינה']),
      dbRecipe(2, 'מוסקה חצילים', ['חציל', 'בשר'])
    ] as never);

    const result = await reviewMenuDraft({
      meals: [
        {
          meal_type: 'ארוחת ערב',
          recipes: [
            { recipe_id: 1, course_type: 'ראשונה' },
            { recipe_id: 2, course_type: 'עיקרית' }
          ]
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.stringContaining('חזרה על מרכיבים דומיננטיים'));
    expect(result.issues.join()).toContain('חציל');
  });

  it('ignores pantry staples shared by every recipe', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      dbRecipe(1, 'סלט ירקות', ['מלח', 'שמן זית', 'חסה']),
      dbRecipe(2, 'עוף בתנור', ['מלח', 'שמן זית', 'עוף'])
    ] as never);

    expect(await reviewMenuDraft(GOOD_DRAFT)).toEqual({ ok: true, issues: [] });
  });
});

// @vitest-environment node
/**
 * Finalization: the plan comes back through a response schema and is checked
 * before anyone can save it. A malformed answer must fail loudly here rather
 * than reach the UI — and nothing may be salvaged out of prose with a regex.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/gemini/generate', () => ({ generateJson: vi.fn() }));

import { generateJson } from '@/lib/ai/gemini/generate';
import { finalizeMenuPlan, MenuPlanFormatError } from '@/lib/ai/menu/finalize';
import { parseMenuPlan, MENU_PLAN_SCHEMA } from '@/lib/ai/menu/schema';

const PREFERENCES = { name: 'תפריט שבת', servings: 6, meal_types: ['ארוחת ערב'] };

const PLAN = {
  meals: [
    {
      meal_type: 'ארוחת ערב',
      meal_order: 1,
      recipes: [
        { recipe_id: 5, course_type: 'עיקרית', course_order: 1, ai_reason: 'מנה מרכזית חגיגית' }
      ]
    }
  ],
  reasoning: 'תפריט מאוזן לשבת'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('finalizeMenuPlan', () => {
  it('asks for JSON against the menu schema and returns the typed plan', async () => {
    vi.mocked(generateJson).mockResolvedValue(JSON.stringify(PLAN));

    const plan = await finalizeMenuPlan(PREFERENCES, 'ארוחת ערב: מתכון 5');

    expect(plan).toEqual(PLAN);
    expect(vi.mocked(generateJson).mock.calls[0][0].schema).toBe(MENU_PLAN_SCHEMA);
  });

  it('refuses to call the model when the agent produced nothing', async () => {
    await expect(finalizeMenuPlan(PREFERENCES, '   ')).rejects.toBeInstanceOf(MenuPlanFormatError);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('throws on an answer that is not JSON — no regex rescue', async () => {
    vi.mocked(generateJson).mockResolvedValue('הנה התפריט: { meals: ... }');

    await expect(finalizeMenuPlan(PREFERENCES, 'סיכום')).rejects.toBeInstanceOf(
      MenuPlanFormatError
    );
  });

  it('throws when the JSON parses but fails validation', async () => {
    vi.mocked(generateJson).mockResolvedValue(JSON.stringify({ meals: [], reasoning: 'ריק' }));

    await expect(finalizeMenuPlan(PREFERENCES, 'סיכום')).rejects.toBeInstanceOf(
      MenuPlanFormatError
    );
  });
});

describe('parseMenuPlan', () => {
  it('accepts the happy shape unchanged', () => {
    expect(parseMenuPlan(PLAN)).toEqual(PLAN);
  });

  it('coerces stringified integers models emit for INTEGER fields', () => {
    const plan = parseMenuPlan({
      meals: [
        {
          meal_type: 'ארוחת ערב',
          meal_order: '1',
          recipes: [
            { recipe_id: '5', course_type: 'עיקרית', course_order: '2', ai_reason: 'נימוק' }
          ]
        }
      ],
      reasoning: 'נימוק כללי'
    });

    expect(plan?.meals[0].meal_order).toBe(1);
    expect(plan?.meals[0].recipes[0]).toMatchObject({ recipe_id: 5, course_order: 2 });
  });

  it('rejects a recipe with no ai_reason — the field the save route persists', () => {
    expect(
      parseMenuPlan({
        meals: [
          {
            meal_type: 'ארוחת ערב',
            meal_order: 1,
            recipes: [{ recipe_id: 5, course_type: 'עיקרית', course_order: 1 }]
          }
        ],
        reasoning: 'נימוק'
      })
    ).toBeNull();
  });

  it('rejects a non-numeric recipe id and a meal with no recipes', () => {
    const badId = {
      meals: [
        {
          meal_type: 'ערב',
          meal_order: 1,
          recipes: [{ recipe_id: 'חמש', course_type: 'עיקרית', course_order: 1, ai_reason: 'x' }]
        }
      ],
      reasoning: 'נימוק'
    };
    expect(parseMenuPlan(badId)).toBeNull();
    expect(parseMenuPlan({ meals: [{ meal_type: 'ערב', meal_order: 1, recipes: [] }] })).toBeNull();
    expect(parseMenuPlan('not an object')).toBeNull();
  });
});

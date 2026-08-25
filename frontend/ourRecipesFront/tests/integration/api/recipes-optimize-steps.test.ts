// @vitest-environment node
/**
 * `POST /api/recipes/optimize-steps` answers the structured plan
 * `RecipeStepOptimizer` renders — never free text. The route validates the
 * model's answer, so a non-conforming answer must surface as a 502 instead of
 * reaching the UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/aiService', () => ({
  optimizeRecipeSteps: vi.fn()
}));

import { optimizeRecipeSteps } from '@/lib/services/aiService';
import { POST } from '@/app/api/recipes/optimize-steps/route';

const optimizeRecipeStepsMock = vi.mocked(optimizeRecipeSteps);

const PLAN = {
  optimized_steps: [
    {
      step_group: 'הכנת הבצק',
      parallel_steps: [
        { description: 'לערבב קמח וסוכר', estimated_time: '5', dependencies: [] },
        { description: 'לחמם את התנור', estimated_time: '10', dependencies: ['לערבב קמח וסוכר'] }
      ]
    }
  ],
  prep_ahead_steps: [{ description: 'להכין את הקרם', max_prep_time: '24' }],
  total_sequential_time: '45',
  total_optimized_time: '30',
  time_saved: '15'
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/recipes/optimize-steps'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } as any);
}

beforeEach(() => {
  optimizeRecipeStepsMock.mockReset();
});

describe('POST /api/recipes/optimize-steps', () => {
  it('rejects a body with no recipeText', async () => {
    const response = await POST(postRequest({}));

    expect(response.status).toBe(400);
    expect(optimizeRecipeStepsMock).not.toHaveBeenCalled();
  });

  it('returns the structured plan under `data`, ready to render', async () => {
    optimizeRecipeStepsMock.mockResolvedValue(PLAN);

    const response = await POST(postRequest({ recipeText: 'כותרת: עוגה' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toEqual(PLAN);
    // No free-text envelope any more.
    expect(json.data.message).toBeUndefined();
    expect(optimizeRecipeStepsMock).toHaveBeenCalledWith('כותרת: עוגה');
  });

  it('normalises numeric time fields the model may return unquoted', async () => {
    optimizeRecipeStepsMock.mockResolvedValue({
      ...PLAN,
      total_sequential_time: 45,
      total_optimized_time: 30,
      time_saved: 15,
      optimized_steps: [
        {
          step_group: 'הכנת הבצק',
          parallel_steps: [
            { description: 'לערבב קמח וסוכר', estimated_time: 5, dependencies: [] }
          ]
        }
      ]
    });

    const response = await POST(postRequest({ recipeText: 'כותרת: עוגה' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.total_sequential_time).toBe('45');
    expect(json.data.time_saved).toBe('15');
    expect(json.data.optimized_steps[0].parallel_steps[0].estimated_time).toBe('5');
  });

  it('defaults a missing prep_ahead_steps list to an empty array', async () => {
    const { prep_ahead_steps, ...withoutPrepAhead } = PLAN;
    optimizeRecipeStepsMock.mockResolvedValue(withoutPrepAhead);

    const response = await POST(postRequest({ recipeText: 'כותרת: עוגה' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.prep_ahead_steps).toEqual([]);
  });

  it.each([
    ['free text instead of JSON', null],
    ['an unrelated object', { message: 'הנה השלבים המשופרים...' }],
    ['a plan with no step groups', { ...PLAN, optimized_steps: [] }],
    [
      'a step group missing its steps',
      { ...PLAN, optimized_steps: [{ step_group: 'הכנת הבצק' }] }
    ],
    [
      'a step missing its estimated time',
      {
        ...PLAN,
        optimized_steps: [
          {
            step_group: 'הכנת הבצק',
            parallel_steps: [{ description: 'לערבב', dependencies: [] }]
          }
        ]
      }
    ],
    ['a plan missing its totals', { optimized_steps: PLAN.optimized_steps, prep_ahead_steps: [] }],
    [
      'a malformed prep-ahead entry',
      { ...PLAN, prep_ahead_steps: [{ description: 'להכין את הקרם' }] }
    ]
  ])('answers 502 for %s', async (_label, answer) => {
    optimizeRecipeStepsMock.mockResolvedValue(answer);

    const response = await POST(postRequest({ recipeText: 'כותרת: עוגה' }));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error.statusCode).toBe(502);
    expect(json.error.message).toMatch(/unusable plan/i);
  });

  it('surfaces an AI provider failure as a 500 rather than a half-rendered plan', async () => {
    optimizeRecipeStepsMock.mockRejectedValue(new Error('Gemini unavailable'));

    const response = await POST(postRequest({ recipeText: 'כותרת: עוגה' }));

    expect(response.status).toBe(500);
  });
});

// @vitest-environment node
/**
 * `POST /api/menus/generate-preview` — the agent's entry point. The route
 * itself only validates, pre-checks the recipe count, and echoes the plan back
 * for the save step, so the agent is mocked here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

vi.mock('@/lib/ai/menu', () => ({ generateMenuPreview: vi.fn() }));

import { generateMenuPreview } from '@/lib/ai/menu';
import { POST } from '@/app/api/menus/generate-preview/route';

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

const BODY = {
  name: 'תפריט שבת',
  event_type: 'שבת',
  servings: 6,
  dietary_type: 'meat',
  meal_types: ['ארוחת ערב'],
  special_requests: 'בלי חריף'
};

function previewRequest(body: unknown) {
  return createMockRequest('http://localhost:3000/api/menus/generate-preview', {
    method: 'POST',
    body
  });
}

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

describe('POST /api/menus/generate-preview', () => {
  it('returns the plan and echoes the preferences back for the save step', async () => {
    prismaMock.recipe.count.mockResolvedValue(42 as never);
    vi.mocked(generateMenuPreview).mockResolvedValue(PLAN);

    const response = await POST(previewRequest(BODY));

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<{ data: { preview: typeof PLAN; preferences: unknown } }>(
      response
    );
    expect(json.data.preview).toEqual(PLAN);
    expect(json.data.preferences).toMatchObject({ name: 'תפריט שבת' });
    // `ai_reason` survives the route untouched — the save endpoint reads it by that name.
    expect(json.data.preview.meals[0].recipes[0].ai_reason).toBe('מנה מרכזית חגיגית');
    expect(generateMenuPreview).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'תפריט שבת', servings: 6, meal_types: ['ארוחת ערב'] })
    );
  });

  it('400s without a name or without meal types, before spending an agent run', async () => {
    const noName = await POST(previewRequest({ meal_types: ['ארוחת ערב'] }));
    const noMeals = await POST(previewRequest({ name: 'תפריט' }));

    expect(noName.status).toBe(400);
    expect(noMeals.status).toBe(400);
    expect(generateMenuPreview).not.toHaveBeenCalled();
  });

  it('400s when the database has fewer than 5 plannable recipes', async () => {
    prismaMock.recipe.count.mockResolvedValue(3 as never);

    const response = await POST(previewRequest(BODY));

    expect(response.status).toBe(400);
    expect(prismaMock.recipe.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', is_parsed: true }
    });
    expect(generateMenuPreview).not.toHaveBeenCalled();
  });

  it('500s when the agent throws', async () => {
    prismaMock.recipe.count.mockResolvedValue(42 as never);
    vi.mocked(generateMenuPreview).mockRejectedValue(new Error('gemini exploded'));

    const response = await POST(previewRequest(BODY));

    expect(response.status).toBe(500);
  });
});

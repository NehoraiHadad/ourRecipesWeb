// @vitest-environment node
/**
 * The list endpoints hand the UI a *projection*, not the whole row, so the
 * columns the screens actually render are part of the contract:
 *
 * - `GET /api/menus` — the menus grid prints `menu.meals.length` ("N ארוחות"),
 *   and (Stage H2) serializes through the same `serializeMenu`/
 *   `menuMealsInclude` every other menu route uses — one contract, not a
 *   trimmed-down list projection.
 * - `GET /api/recipes/manage` — the management toolbar filters on
 *   `parse_errors` and the rows render it as an error badge.
 *
 * Both regressed once by being trimmed away; these tests pin them down.
 *
 * `@tests/mocks/prisma` must be imported before anything that pulls in
 * `@/lib/prisma`, and routes are imported lazily inside each test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';
import { recipeRow } from '@tests/helpers/recipeFixtures';
import { signSession } from '@/lib/auth/session';
import { menuMealsInclude } from '@/lib/serializers/menu';

const OWNER = '111';

async function authHeaders(sub = OWNER) {
  const token = await signSession({ sub, type: 'telegram', permissions: { can_edit: false } });
  return { authorization: `Bearer ${token}` };
}

beforeEach(() => {
  resetPrismaMock();
  process.env.JWT_SECRET = 'test-jwt-secret-value-not-a-real-one';
});

describe('GET /api/menus', () => {
  it('includes each menu\'s meals (via the shared serializer) so the list can count them', async () => {
    const { GET } = await import('@/app/api/menus/route');

    prismaMock.menu.count.mockResolvedValue(1);
    prismaMock.menu.findMany.mockResolvedValue([
      {
        id: 1,
        user_id: '111',
        name: 'תפריט שבת',
        event_type: 'שבת',
        description: null,
        total_servings: 6,
        dietary_type: 'MEAT',
        share_token: 'tok123',
        is_public: false,
        ai_reasoning: null,
        created_at: new Date('2024-01-01T10:00:00Z'),
        updated_at: new Date('2024-01-01T10:00:00Z'),
        meals: [
          { id: 10, menu_id: 1, meal_type: 'ארוחת ערב', meal_order: 1, meal_time: null, notes: null, created_at: new Date('2024-01-01T10:00:00Z'), recipes: [] },
          { id: 11, menu_id: 1, meal_type: 'ארוחת בוקר', meal_order: 2, meal_time: null, notes: null, created_at: new Date('2024-01-01T10:00:00Z'), recipes: [] }
        ]
      } as any
    ]);

    const request = createMockRequest('http://localhost:3000/api/menus', {
      headers: await authHeaders()
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].meals).toHaveLength(2);
    expect(json.data[0].meals[0].meal_type).toBe('ארוחת ערב');

    // Same shape every menu route answers with — the shared include, not a
    // hand-trimmed list projection.
    expect((prismaMock.menu.findMany.mock.calls[0][0] as any).include).toEqual(menuMealsInclude);
  });
});

describe('GET /api/recipes/manage', () => {
  it('projects parse_errors so the "with errors" filters work', async () => {
    const { GET } = await import('@/app/api/recipes/manage/route');

    prismaMock.recipe.count.mockResolvedValue(1);
    prismaMock.recipe.findMany.mockResolvedValue([
      recipeRow({
        telegram_id: 5005,
        categories: 'קינוחים',
        parse_errors: 'לא נמצאו מצרכים||לא נמצאו הוראות הכנה'
      }) as any
    ]);

    const request = createMockRequest('http://localhost:3000/api/recipes/manage');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    // The contract splits the `||` column into a real array (Stage C).
    expect(json.data[0].parse_errors).toEqual([
      'לא נמצאו מצרכים',
      'לא נמצאו הוראות הכנה'
    ]);
    expect((prismaMock.recipe.findMany.mock.calls[0][0] as any).select.parse_errors).toBe(true);
  });

  it('serializes through the one shared recipe contract — structured, no legacy columns', async () => {
    const { GET } = await import('@/app/api/recipes/manage/route');

    prismaMock.recipe.count.mockResolvedValue(1);
    prismaMock.recipe.findMany.mockResolvedValue([
      recipeRow({
        categories: 'קינוחים, עוגות',
        difficulty: 'EASY',
        is_parsed: true,
        ingredients_list: [{ quantity: 2, unit: 'כפות', name: 'סוכר' }]
      }) as any
    ]);

    const response = await GET(createMockRequest('http://localhost:3000/api/recipes/manage'));
    const recipe = (await parseJsonResponse<any>(response)).data[0];

    expect(recipe.categories).toEqual(['קינוחים', 'עוגות']);
    expect(recipe.ingredients).toEqual([{ quantity: 2, unit: 'כפות', name: 'סוכר' }]);
    expect(recipe.difficulty).toBe('easy');
    expect(recipe.created_at).toBe('2024-01-01T10:00:00.000Z');
    // The dying columns never reach the wire.
    expect(recipe).not.toHaveProperty('details');
    expect(recipe).not.toHaveProperty('ingredients_list');
    expect(recipe).not.toHaveProperty('formatted_content');
    expect(recipe).not.toHaveProperty('recipe_metadata');

    const select = (prismaMock.recipe.findMany.mock.calls[0][0] as any).select;
    expect(select.ingredients).toBeUndefined();
    expect(select.formatted_content).toBeUndefined();
    expect(select.recipe_metadata).toBeUndefined();
  });

  it('defaults to the upper-case ACTIVE status', async () => {
    const { GET } = await import('@/app/api/recipes/manage/route');

    prismaMock.recipe.count.mockResolvedValue(0);
    prismaMock.recipe.findMany.mockResolvedValue([]);

    const request = createMockRequest('http://localhost:3000/api/recipes/manage');
    await GET(request);

    expect((prismaMock.recipe.findMany.mock.calls[0][0] as any).where).toEqual({ status: 'ACTIVE' });
  });
});

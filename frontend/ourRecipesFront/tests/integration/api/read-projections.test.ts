// @vitest-environment node
/**
 * The list endpoints hand the UI a *projection*, not the whole row, so the
 * columns the screens actually render are part of the contract:
 *
 * - `GET /api/menus` — the menus grid prints `menu.meals.length` ("N ארוחות").
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
import { signSession } from '@/lib/auth/session';

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
  it('includes each menu\'s meals so the list can count them', async () => {
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
        created_at: new Date('2024-01-01T10:00:00Z'),
        updated_at: new Date('2024-01-01T10:00:00Z'),
        telegram_message_id: null,
        meals: [
          { id: 10, menu_id: 1, meal_type: 'ארוחת ערב', meal_order: 1, meal_time: null, notes: null, created_at: new Date('2024-01-01T10:00:00Z') },
          { id: 11, menu_id: 1, meal_type: 'ארוחת בוקר', meal_order: 2, meal_time: null, notes: null, created_at: new Date('2024-01-01T10:00:00Z') }
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

    // Meals ship without their recipe tree — the list view never renders it.
    const select = (prismaMock.menu.findMany.mock.calls[0][0] as any).select;
    expect(select.meals.select.recipes).toBeUndefined();
  });
});

describe('GET /api/recipes/manage', () => {
  it('projects parse_errors so the "with errors" filters work', async () => {
    const { GET } = await import('@/app/api/recipes/manage/route');

    prismaMock.recipe.count.mockResolvedValue(1);
    prismaMock.recipe.findMany.mockResolvedValue([
      {
        id: 1,
        telegram_id: 5005,
        title: 'עוגת שוקולד',
        categories: 'קינוחים',
        is_parsed: false,
        parse_errors: 'לא נמצאו מצרכים||לא נמצאו הוראות הכנה',
        is_verified: false,
        sync_status: 'synced',
        created_at: new Date('2024-01-01T10:00:00Z'),
        updated_at: new Date('2024-01-01T10:00:00Z'),
        image_url: null,
        status: 'ACTIVE'
      } as any
    ]);

    const request = createMockRequest('http://localhost:3000/api/recipes/manage');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.data[0].parse_errors).toBe('לא נמצאו מצרכים||לא נמצאו הוראות הכנה');
    expect((prismaMock.recipe.findMany.mock.calls[0][0] as any).select.parse_errors).toBe(true);
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

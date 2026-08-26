/**
 * @vitest-environment node
 *
 * Integration tests for the menus write surface (Wave 1.C): save, update,
 * delete, meals, meal-recipes. Prisma is mocked with vitest-mock-extended;
 * the Telegram Bot API is mocked at `@/lib/telegram/botApi` (per Wave 0's
 * own test style) so the real mirror/format code in
 * `@/lib/telegram/menuMirror` still runs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';
import { signSession } from '@/lib/auth/session';
import { sendMessage, editMessageText, deleteMessage, TelegramApiError } from '@/lib/telegram/botApi';

vi.mock('@/lib/telegram/botApi', () => ({
  sendMessage: vi.fn(),
  editMessageText: vi.fn(),
  deleteMessage: vi.fn(),
  TelegramApiError: class TelegramApiError extends Error {}
}));

vi.mock('@/lib/services/shoppingListService', () => ({
  generateShoppingList: vi.fn().mockResolvedValue({ 'ירקות': [] })
}));

const sendMessageMock = vi.mocked(sendMessage);
const editMessageTextMock = vi.mocked(editMessageText);
const deleteMessageMock = vi.mocked(deleteMessage);

const OWNER = '111';
const OTHER_USER = '222';

async function authHeaders(sub = OWNER) {
  const token = await signSession({ sub, type: 'telegram', permissions: { can_edit: false } });
  return { authorization: `Bearer ${token}` };
}

function baseMenuRow(overrides: Partial<any> = {}) {
  return {
    id: 1,
    user_id: OWNER,
    telegram_message_id: null,
    last_sync: null,
    name: 'תפריט שבת',
    event_type: 'שבת',
    description: null,
    total_servings: 6,
    dietary_type: 'MEAT',
    share_token: 'tok123',
    is_public: false,
    ai_reasoning: null,
    generation_prompt: null,
    created_at: new Date('2024-01-01T10:00:00Z'),
    updated_at: new Date('2024-01-01T10:00:00Z'),
    meals: [
      {
        id: 10,
        menu_id: 1,
        meal_type: 'ארוחת ערב',
        meal_order: 1,
        meal_time: null,
        notes: null,
        created_at: new Date('2024-01-01T10:00:00Z'),
        recipes: [
          {
            id: 100,
            menu_meal_id: 10,
            recipe_id: 5,
            course_type: 'עיקרית',
            course_order: 1,
            servings: 6,
            notes: null,
            ai_reason: null,
            created_at: new Date('2024-01-01T10:00:00Z'),
            recipe: {
              id: 5,
              telegram_id: 5005,
              title: 'עוף בתנור',
              cooking_time: 60,
              preparation_time: 15,
              difficulty: 'EASY',
              servings: 4,
              image_url: null
            }
          }
        ]
      }
    ],
    ...overrides
  };
}

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-jwt-secret-value-not-a-real-one';
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';

  // vitest-mock-extended doesn't run the real $transaction callback by default —
  // route the callback straight at the mocked client so `tx.*` calls hit the
  // same mocks as everything else in the test.
  (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[]))
  );
});

describe('POST /api/menus (save)', () => {
  it('creates the menu, generates the shopping list, and mirrors it to Telegram', async () => {
    const { POST } = await import('@/app/api/menus/route');

    prismaMock.menu.create.mockResolvedValue({ id: 1 } as any);
    prismaMock.menuMeal.create.mockResolvedValue({ id: 10 } as any);
    prismaMock.recipe.findFirst.mockResolvedValue({ id: 5, title: 'עוף בתנור' } as any);
    prismaMock.mealRecipe.create.mockResolvedValue({ id: 100 } as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow() as any);
    sendMessageMock.mockResolvedValue({ message_id: 999 } as any);
    prismaMock.menu.update.mockResolvedValue(baseMenuRow({ telegram_message_id: 999 }) as any);

    const request = createMockRequest('http://localhost:3000/api/menus', {
      method: 'POST',
      headers: await authHeaders(),
      body: {
        preview: {
          meals: [
            { meal_type: 'ארוחת ערב', meal_order: 1, recipes: [{ recipe_id: 5, course_type: 'עיקרית', course_order: 1 }] }
          ],
          reasoning: 'בחירה מאוזנת'
        },
        preferences: { name: 'תפריט שבת', event_type: 'שבת', servings: 6, dietary_type: 'meat' }
      }
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const json = await parseJsonResponse<any>(response);
    expect(json.success).toBe(true);
    expect(json.menu.id).toBe(1);
    expect(json.menu.name).toBe('תפריט שבת');
    expect(json.menu.dietary_type).toBe('meat');
    expect(json.shopping_list).toBeDefined();
    // The UI opens a menu recipe through `GET /api/recipes/:telegram_id`, so
    // the embedded summary must carry the telegram id, not just the PK.
    expect(json.menu.meals[0].recipes[0].recipe).toMatchObject({ id: 5, telegram_id: 5005 });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0][0].chat_id).toBe('-1001234567890');
    // Successful mirror persists the message id.
    expect(prismaMock.menu.update).toHaveBeenCalledTimes(1);
  });

  it('persists the preview\'s `ai_reason` onto the meal recipe', async () => {
    // Wave 2B contract fix: the preview emits `ai_reason` and this route used
    // to read `reason`, so every saved menu lost its explanations.
    const { POST } = await import('@/app/api/menus/route');

    prismaMock.menu.create.mockResolvedValue({ id: 1 } as any);
    prismaMock.menuMeal.create.mockResolvedValue({ id: 10 } as any);
    prismaMock.recipe.findFirst.mockResolvedValue({ id: 5, title: 'עוף בתנור' } as any);
    prismaMock.mealRecipe.create.mockResolvedValue({ id: 100 } as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow() as any);
    sendMessageMock.mockResolvedValue({ message_id: 999 } as any);
    prismaMock.menu.update.mockResolvedValue(baseMenuRow({ telegram_message_id: 999 }) as any);

    const request = createMockRequest('http://localhost:3000/api/menus', {
      method: 'POST',
      headers: await authHeaders(),
      body: {
        preview: {
          meals: [
            {
              meal_type: 'ארוחת ערב',
              meal_order: 1,
              recipes: [
                {
                  recipe_id: 5,
                  course_type: 'עיקרית',
                  course_order: 1,
                  ai_reason: 'מנה מרכזית חגיגית שמתאימה לשבת'
                }
              ]
            }
          ],
          reasoning: 'בחירה מאוזנת'
        },
        preferences: { name: 'תפריט שבת', servings: 6 }
      }
    });

    expect((await POST(request)).status).toBe(201);

    expect(prismaMock.mealRecipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipe_id: 5,
        ai_reason: 'מנה מרכזית חגיגית שמתאימה לשבת'
      })
    });
    expect(prismaMock.menu.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ai_reasoning: 'בחירה מאוזנת' })
    });
  });

  it('still saves the menu when Telegram is down', async () => {
    const { POST } = await import('@/app/api/menus/route');

    prismaMock.menu.create.mockResolvedValue({ id: 2 } as any);
    prismaMock.recipe.findFirst.mockResolvedValue(null); // no meals/recipes needed for this case
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow({ id: 2, meals: [] }) as any);
    sendMessageMock.mockRejectedValue(new TelegramApiError({ method: 'sendMessage', error_code: 500, description: 'down' } as any));

    const request = createMockRequest('http://localhost:3000/api/menus', {
      method: 'POST',
      headers: await authHeaders(),
      body: {
        preview: { meals: [], reasoning: null },
        preferences: { name: 'תפריט שבת', servings: 6 }
      }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const json = await parseJsonResponse<any>(response);
    expect(json.success).toBe(true);
    expect(json.menu.id).toBe(2);

    // Mirror attempted and failed — the menu is not re-fetched/updated for a message id.
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.menu.update).not.toHaveBeenCalled();
  });

  it('400s when preview or preferences are missing', async () => {
    const { POST } = await import('@/app/api/menus/route');

    const request = createMockRequest('http://localhost:3000/api/menus', {
      method: 'POST',
      headers: await authHeaders(),
      body: { preview: { meals: [] } } // preferences missing
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('401s when unauthenticated', async () => {
    const { POST } = await import('@/app/api/menus/route');

    const request = createMockRequest('http://localhost:3000/api/menus', {
      method: 'POST',
      body: { preview: { meals: [] }, preferences: { name: 'x' } }
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});

describe('PUT /api/menus/:id', () => {
  it("updates the owner's menu and mirrors the edit to Telegram", async () => {
    const { PUT } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.menu.update.mockResolvedValue(
      baseMenuRow({ telegram_message_id: 555, name: 'תפריט מעודכן' }) as any
    );
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(
      baseMenuRow({ telegram_message_id: 555, name: 'תפריט מעודכן' }) as any
    );
    editMessageTextMock.mockResolvedValue({ message_id: 555 } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      method: 'PUT',
      headers: await authHeaders(),
      body: { name: 'תפריט מעודכן' }
    });

    const response = await PUT(request, { params: { id: '1' } });
    expect(response.status).toBe(200);

    const json = await parseJsonResponse<any>(response);
    expect(json.success).toBe(true);
    expect(json.menu.name).toBe('תפריט מעודכן');
    expect(editMessageTextMock).toHaveBeenCalledTimes(1);
    expect(editMessageTextMock.mock.calls[0][0].message_id).toBe(555);
  });

  it("403s when the menu belongs to a different user", async () => {
    const { PUT } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OTHER_USER } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      method: 'PUT',
      headers: await authHeaders(OWNER),
      body: { name: 'x' }
    });

    const response = await PUT(request, { params: { id: '1' } });
    expect(response.status).toBe(403);
    expect(prismaMock.menu.update).not.toHaveBeenCalled();
  });

  it('404s when the menu does not exist', async () => {
    const { PUT } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/menus/999', {
      method: 'PUT',
      headers: await authHeaders(),
      body: { name: 'x' }
    });

    const response = await PUT(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });

  it('still updates the menu when Telegram is down', async () => {
    const { PUT } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.menu.update.mockResolvedValue({} as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow({ telegram_message_id: 555 }) as any);
    editMessageTextMock.mockRejectedValue(new TelegramApiError({ method: 'editMessageText', error_code: 500, description: 'down' } as any));

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      method: 'PUT',
      headers: await authHeaders(),
      body: { description: 'תיאור חדש' }
    });

    const response = await PUT(request, { params: { id: '1' } });
    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.success).toBe(true);
    // Only the primary field update happened — no second `last_sync` update after a failed mirror.
    expect(prismaMock.menu.update).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/menus/:id', () => {
  it('deletes the mirrored Telegram message before deleting the menu', async () => {
    const { DELETE } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER, telegram_message_id: 777 } as any);
    deleteMessageMock.mockResolvedValue(true as any);
    prismaMock.menu.delete.mockResolvedValue({} as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '1' } });
    expect(response.status).toBe(200);

    const json = await parseJsonResponse<any>(response);
    expect(json.success).toBe(true);
    expect(json.message).toBe('Menu deleted successfully');

    expect(deleteMessageMock).toHaveBeenCalledWith({ chat_id: '-1001234567890', message_id: 777 });
    expect(prismaMock.menu.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('still deletes the menu from the DB when the Telegram delete fails', async () => {
    const { DELETE } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER, telegram_message_id: 777 } as any);
    deleteMessageMock.mockRejectedValue(new TelegramApiError({ method: 'deleteMessage', error_code: 400, description: 'message not found' } as any));
    prismaMock.menu.delete.mockResolvedValue({} as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '1' } });
    expect(response.status).toBe(200);
    expect(prismaMock.menu.delete).toHaveBeenCalledTimes(1);
  });

  it('403s when the menu belongs to a different user (owner-only, not public access)', async () => {
    const { DELETE } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OTHER_USER, telegram_message_id: null } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      method: 'DELETE',
      headers: await authHeaders(OWNER)
    });

    const response = await DELETE(request, { params: { id: '1' } });
    expect(response.status).toBe(403);
    expect(prismaMock.menu.delete).not.toHaveBeenCalled();
    expect(deleteMessageMock).not.toHaveBeenCalled();
  });

  it('404s when the menu does not exist', async () => {
    const { DELETE } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/menus/999', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/menus/:id/meals', () => {
  it('adds a meal and auto-increments meal_order', async () => {
    const { POST } = await import('@/app/api/menus/[id]/meals/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.menuMeal.aggregate.mockResolvedValue({ _max: { meal_order: 2 } } as any);
    prismaMock.menuMeal.create.mockResolvedValue({
      id: 20,
      menu_id: 1,
      meal_type: 'ארוחת בוקר',
      meal_order: 3,
      meal_time: null,
      notes: null,
      created_at: new Date()
    } as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow({ telegram_message_id: null }) as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals', {
      method: 'POST',
      headers: await authHeaders(),
      body: { meal_type: 'ארוחת בוקר' }
    });

    const response = await POST(request, { params: { id: '1' } });
    expect(response.status).toBe(201);

    const json = await parseJsonResponse<any>(response);
    expect(json.success).toBe(true);
    expect(json.meal.meal_order).toBe(3);
    expect(json.meal.recipes).toEqual([]);
    expect(editMessageTextMock).not.toHaveBeenCalled(); // no telegram_message_id on the menu yet
  });

  it('400s when meal_type is missing', async () => {
    const { POST } = await import('@/app/api/menus/[id]/meals/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals', {
      method: 'POST',
      headers: await authHeaders(),
      body: {}
    });

    const response = await POST(request, { params: { id: '1' } });
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/menus/:id/meals/:mealId', () => {
  it('deletes the meal and regenerates the shopping list', async () => {
    const { DELETE } = await import('@/app/api/menus/[id]/meals/[mealId]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.menuMeal.findUnique.mockResolvedValue({ id: 10, menu_id: 1 } as any);
    prismaMock.menuMeal.delete.mockResolvedValue({} as any);
    prismaMock.shoppingListItem.deleteMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow({ meals: [] }) as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '1', mealId: '10' } });
    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.success).toBe(true);
    expect(json.shopping_list).toBeDefined();
    expect(prismaMock.menuMeal.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it("404s when the meal doesn't belong to the menu", async () => {
    const { DELETE } = await import('@/app/api/menus/[id]/meals/[mealId]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.menuMeal.findUnique.mockResolvedValue({ id: 10, menu_id: 999 } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '1', mealId: '10' } });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/menus/:id/meals/:mealId/recipes', () => {
  it('adds a recipe to the meal', async () => {
    const { POST } = await import('@/app/api/menus/[id]/meals/[mealId]/recipes/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER, total_servings: 6 } as any);
    prismaMock.menuMeal.findUnique.mockResolvedValue({ id: 10, menu_id: 1 } as any);
    prismaMock.recipe.findFirst.mockResolvedValue({ id: 7 } as any);
    prismaMock.mealRecipe.aggregate.mockResolvedValue({ _max: { course_order: 1 } } as any);
    prismaMock.mealRecipe.create.mockResolvedValue({
      id: 200,
      menu_meal_id: 10,
      recipe_id: 7,
      course_type: 'סלט',
      course_order: 2,
      servings: 6,
      notes: null,
      ai_reason: null,
      created_at: new Date(),
      recipe: { id: 7, telegram_id: 7007, title: 'סלט ירוק', cooking_time: 10, preparation_time: 5, difficulty: 'EASY', servings: 4, image_url: null }
    } as any);
    prismaMock.shoppingListItem.deleteMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow() as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10/recipes', {
      method: 'POST',
      headers: await authHeaders(),
      body: { recipe_id: 7, course_type: 'סלט' }
    });

    const response = await POST(request, { params: { id: '1', mealId: '10' } });
    expect(response.status).toBe(201);
    const json = await parseJsonResponse<any>(response);
    expect(json.meal_recipe.recipe_id).toBe(7);
    expect(json.meal_recipe.recipe.title).toBe('סלט ירוק');
    expect(json.meal_recipe.recipe.telegram_id).toBe(7007);
  });

  it('404s when the recipe does not exist', async () => {
    const { POST } = await import('@/app/api/menus/[id]/meals/[mealId]/recipes/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER, total_servings: 6 } as any);
    prismaMock.menuMeal.findUnique.mockResolvedValue({ id: 10, menu_id: 1 } as any);
    prismaMock.recipe.findFirst.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10/recipes', {
      method: 'POST',
      headers: await authHeaders(),
      body: { recipe_id: 999 }
    });

    const response = await POST(request, { params: { id: '1', mealId: '10' } });
    expect(response.status).toBe(404);
  });
});

describe('PUT /api/menus/:id/meals/:mealId/recipes/:recipeId (replace)', () => {
  it('replaces the recipe in the meal', async () => {
    const { PUT } = await import('@/app/api/menus/[id]/meals/[mealId]/recipes/[recipeId]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.mealRecipe.findFirst.mockResolvedValue({ id: 100, menu_meal_id: 10, recipe_id: 5 } as any);
    prismaMock.mealRecipe.update.mockResolvedValue({
      id: 100,
      menu_meal_id: 10,
      recipe_id: 8,
      course_type: 'עיקרית',
      course_order: 1,
      servings: 6,
      notes: null,
      ai_reason: null,
      created_at: new Date(),
      recipe: { id: 8, telegram_id: 8008, title: 'דג בתנור', cooking_time: 40, preparation_time: 10, difficulty: 'MEDIUM', servings: 4, image_url: null }
    } as any);
    prismaMock.shoppingListItem.deleteMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow() as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10/recipes/5', {
      method: 'PUT',
      headers: await authHeaders(),
      body: { new_recipe_id: 8 }
    });

    const response = await PUT(request, { params: { id: '1', mealId: '10', recipeId: '5' } });
    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.meal_recipe.recipe_id).toBe(8);
    expect(json.meal_recipe.recipe.telegram_id).toBe(8008);
  });

  it('404s when the recipe is not in the meal', async () => {
    const { PUT } = await import('@/app/api/menus/[id]/meals/[mealId]/recipes/[recipeId]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.mealRecipe.findFirst.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10/recipes/5', {
      method: 'PUT',
      headers: await authHeaders(),
      body: { new_recipe_id: 8 }
    });

    const response = await PUT(request, { params: { id: '1', mealId: '10', recipeId: '5' } });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/menus/:id/meals/:mealId/recipes/:recipeId', () => {
  it('removes the recipe from the meal', async () => {
    const { DELETE } = await import('@/app/api/menus/[id]/meals/[mealId]/recipes/[recipeId]/route');

    prismaMock.menu.findUnique.mockResolvedValue({ user_id: OWNER } as any);
    prismaMock.mealRecipe.findFirst.mockResolvedValue({ id: 100, menu_meal_id: 10, recipe_id: 5 } as any);
    prismaMock.mealRecipe.delete.mockResolvedValue({} as any);
    prismaMock.shoppingListItem.deleteMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.menu.findUniqueOrThrow.mockResolvedValue(baseMenuRow({ meals: [] }) as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10/recipes/5', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '1', mealId: '10', recipeId: '5' } });
    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.message).toBe('Recipe deleted successfully');
    expect(prismaMock.mealRecipe.delete).toHaveBeenCalledWith({ where: { id: 100 } });
  });
});

describe('GET /api/menus/:id/meals/:mealId/recipes/:recipeId/suggestions', () => {
  it('returns suggestions for the owner', async () => {
    const { GET } = await import('@/app/api/menus/[id]/meals/[mealId]/recipes/[recipeId]/suggestions/route');

    prismaMock.menu.findUnique.mockResolvedValue({ id: 1, user_id: OWNER, is_public: false, dietary_type: 'MEAT' } as any);
    prismaMock.mealRecipe.findFirst.mockResolvedValue({ course_type: 'main' } as any);
    prismaMock.recipe.findMany.mockResolvedValue([
      { id: 9, telegram_id: 9009, title: 'עוף צלוי', categories: 'עוף,עיקרית', difficulty: 'MEDIUM', cooking_time: 50, preparation_time: 10, image_url: null }
    ] as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10/recipes/5/suggestions', {
      headers: await authHeaders()
    });

    const response = await GET(request, { params: { id: '1', mealId: '10', recipeId: '5' } });
    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.suggestions).toHaveLength(1);
    expect(json.suggestions[0].difficulty).toBe('medium');
    expect(json.suggestions[0].telegram_id).toBe(9009);
  });

  it('403s for a private menu belonging to someone else', async () => {
    const { GET } = await import('@/app/api/menus/[id]/meals/[mealId]/recipes/[recipeId]/suggestions/route');

    prismaMock.menu.findUnique.mockResolvedValue({ id: 1, user_id: OTHER_USER, is_public: false, dietary_type: null } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/meals/10/recipes/5/suggestions', {
      headers: await authHeaders(OWNER)
    });

    const response = await GET(request, { params: { id: '1', mealId: '10', recipeId: '5' } });
    expect(response.status).toBe(403);
  });
});

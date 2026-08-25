// @vitest-environment node
/**
 * Ownership on the menus/shopping-list *read* surface.
 *
 * These routes shipped with `TODO (Phase 3)` placeholders instead of an access
 * check, so any signed-in user (guests included) could list, read and mutate
 * everyone else's menus and shopping lists. The rules pinned here:
 *
 * - `GET /api/menus`                              — owner only, list is scoped by `user_id`.
 * - `GET /api/menus/:id`                          — owner or `is_public`; otherwise 404 (never 403,
 *                                                   which would confirm the id exists).
 * - `GET /api/menus/:id/shopping-list`            — same rule as the menu itself.
 * - `POST /api/menus/:id/shopping-list/regenerate`— owner only (403 for others).
 * - `PATCH|PUT|DELETE /api/shopping-list/items/:id` — owner of the item's *menu* only.
 *
 * The public share path (`GET /api/menus/shared/:token`) is untouched and stays
 * the way a menu reaches people who are not its owner.
 *
 * `@tests/mocks/prisma` must be imported before anything that pulls in
 * `@/lib/prisma`; routes are imported lazily inside each test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';
import { signSession } from '@/lib/auth/session';

vi.mock('@/lib/services/shoppingListService', () => ({
  generateShoppingList: vi.fn().mockResolvedValue({ 'ירקות': [] })
}));

const OWNER = '111';
const OTHER_USER = '222';

async function authHeaders(sub = OWNER) {
  const token = await signSession({ sub, type: 'telegram', permissions: { can_edit: false } });
  return { authorization: `Bearer ${token}` };
}

function menuRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: OWNER,
    name: 'תפריט שבת',
    is_public: false,
    share_token: 'tok123',
    meals: [],
    shopping_list_items: [],
    ...overrides
  } as any;
}

function itemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    menu_id: 1,
    ingredient_name: 'עגבניות',
    quantity: '3',
    category: 'ירקות',
    is_checked: false,
    notes: null,
    menu: { user_id: OWNER },
    ...overrides
  } as any;
}

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-jwt-secret-value-not-a-real-one';
});

describe('GET /api/menus (list)', () => {
  it('scopes both the page and the count to the signed-in user', async () => {
    const { GET } = await import('@/app/api/menus/route');

    prismaMock.menu.count.mockResolvedValue(0);
    prismaMock.menu.findMany.mockResolvedValue([]);

    const request = createMockRequest('http://localhost:3000/api/menus', {
      headers: await authHeaders(OWNER)
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect((prismaMock.menu.findMany.mock.calls[0][0] as any).where).toEqual({ user_id: OWNER });
    expect((prismaMock.menu.count.mock.calls[0][0] as any).where).toEqual({ user_id: OWNER });
  });

  it('does not fold in other people\'s public menus', async () => {
    const { GET } = await import('@/app/api/menus/route');

    prismaMock.menu.count.mockResolvedValue(0);
    prismaMock.menu.findMany.mockResolvedValue([]);

    const request = createMockRequest('http://localhost:3000/api/menus', {
      headers: await authHeaders(OTHER_USER)
    });
    await GET(request);

    const where = (prismaMock.menu.findMany.mock.calls[0][0] as any).where;
    expect(where).toEqual({ user_id: OTHER_USER });
    expect(where.OR).toBeUndefined();
    expect(where.is_public).toBeUndefined();
  });

  it('401s without a token', async () => {
    const { GET } = await import('@/app/api/menus/route');

    const response = await GET(createMockRequest('http://localhost:3000/api/menus'));

    expect(response.status).toBe(401);
    expect(prismaMock.menu.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/menus/:id', () => {
  it('returns the caller\'s own private menu', async () => {
    const { GET } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue(menuRow());

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      headers: await authHeaders(OWNER)
    });
    const response = await GET(request, { params: { id: '1' } });

    expect(response.status).toBe(200);
    expect((await parseJsonResponse<any>(response)).data.id).toBe(1);
  });

  it('404s on someone else\'s private menu instead of 403 (no existence probe)', async () => {
    const { GET } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue(menuRow({ user_id: OTHER_USER, is_public: false }));

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      headers: await authHeaders(OWNER)
    });
    const response = await GET(request, { params: { id: '1' } });

    expect(response.status).toBe(404);
    const json = await parseJsonResponse<any>(response);
    expect(json.error.message).toBe('Menu not found');
  });

  it('serves someone else\'s public menu', async () => {
    const { GET } = await import('@/app/api/menus/[id]/route');

    prismaMock.menu.findUnique.mockResolvedValue(menuRow({ user_id: OTHER_USER, is_public: true }));

    const request = createMockRequest('http://localhost:3000/api/menus/1', {
      headers: await authHeaders(OWNER)
    });
    const response = await GET(request, { params: { id: '1' } });

    expect(response.status).toBe(200);
  });

  it('401s without a token', async () => {
    const { GET } = await import('@/app/api/menus/[id]/route');

    const response = await GET(createMockRequest('http://localhost:3000/api/menus/1'), {
      params: { id: '1' }
    });

    expect(response.status).toBe(401);
    expect(prismaMock.menu.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/menus/:id/shopping-list', () => {
  it('returns the owner\'s list grouped by category', async () => {
    const { GET } = await import('@/app/api/menus/[id]/shopping-list/route');

    prismaMock.menu.findUnique.mockResolvedValue({ id: 1, user_id: OWNER, is_public: false } as any);
    prismaMock.shoppingListItem.findMany.mockResolvedValue([itemRow()]);

    const request = createMockRequest('http://localhost:3000/api/menus/1/shopping-list', {
      headers: await authHeaders(OWNER)
    });
    const response = await GET(request, { params: { id: '1' } });

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.data['ירקות']).toHaveLength(1);
  });

  it('404s on someone else\'s private menu and never touches the items', async () => {
    const { GET } = await import('@/app/api/menus/[id]/shopping-list/route');

    prismaMock.menu.findUnique.mockResolvedValue({ id: 1, user_id: OTHER_USER, is_public: false } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/shopping-list', {
      headers: await authHeaders(OWNER)
    });
    const response = await GET(request, { params: { id: '1' } });

    expect(response.status).toBe(404);
    expect(prismaMock.shoppingListItem.findMany).not.toHaveBeenCalled();
  });

  it('serves the list of someone else\'s public menu (same rule as the menu itself)', async () => {
    const { GET } = await import('@/app/api/menus/[id]/shopping-list/route');

    prismaMock.menu.findUnique.mockResolvedValue({ id: 1, user_id: OTHER_USER, is_public: true } as any);
    prismaMock.shoppingListItem.findMany.mockResolvedValue([]);

    const request = createMockRequest('http://localhost:3000/api/menus/1/shopping-list', {
      headers: await authHeaders(OWNER)
    });
    const response = await GET(request, { params: { id: '1' } });

    expect(response.status).toBe(200);
  });

  it('401s without a token', async () => {
    const { GET } = await import('@/app/api/menus/[id]/shopping-list/route');

    const response = await GET(
      createMockRequest('http://localhost:3000/api/menus/1/shopping-list'),
      { params: { id: '1' } }
    );

    expect(response.status).toBe(401);
    expect(prismaMock.menu.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/menus/:id/shopping-list/regenerate', () => {
  it('regenerates for the owner', async () => {
    const { POST } = await import('@/app/api/menus/[id]/shopping-list/regenerate/route');

    prismaMock.menu.findUnique.mockResolvedValue({ id: 1, user_id: OWNER } as any);
    prismaMock.shoppingListItem.deleteMany.mockResolvedValue({ count: 2 } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/shopping-list/regenerate', {
      method: 'POST',
      headers: await authHeaders(OWNER)
    });
    const response = await POST(request, { params: { id: '1' } });

    expect(response.status).toBe(200);
    expect(prismaMock.shoppingListItem.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('403s for a non-owner even when the menu is public, and wipes nothing', async () => {
    const { POST } = await import('@/app/api/menus/[id]/shopping-list/regenerate/route');

    prismaMock.menu.findUnique.mockResolvedValue({ id: 1, user_id: OTHER_USER, is_public: true } as any);

    const request = createMockRequest('http://localhost:3000/api/menus/1/shopping-list/regenerate', {
      method: 'POST',
      headers: await authHeaders(OWNER)
    });
    const response = await POST(request, { params: { id: '1' } });

    expect(response.status).toBe(403);
    expect(prismaMock.shoppingListItem.deleteMany).not.toHaveBeenCalled();
  });

  it('404s when the menu does not exist', async () => {
    const { POST } = await import('@/app/api/menus/[id]/shopping-list/regenerate/route');

    prismaMock.menu.findUnique.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/menus/999/shopping-list/regenerate', {
      method: 'POST',
      headers: await authHeaders(OWNER)
    });
    const response = await POST(request, { params: { id: '999' } });

    expect(response.status).toBe(404);
  });

  it('401s without a token', async () => {
    const { POST } = await import('@/app/api/menus/[id]/shopping-list/regenerate/route');

    const response = await POST(
      createMockRequest('http://localhost:3000/api/menus/1/shopping-list/regenerate', {
        method: 'POST'
      }),
      { params: { id: '1' } }
    );

    expect(response.status).toBe(401);
    expect(prismaMock.menu.findUnique).not.toHaveBeenCalled();
  });
});

describe('shopping-list item mutations', () => {
  it('PATCH ticks an item off for the owner of its menu', async () => {
    const { PATCH } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(itemRow());
    prismaMock.shoppingListItem.update.mockResolvedValue(itemRow({ is_checked: true }));

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'PATCH',
      headers: await authHeaders(OWNER),
      body: { is_checked: true }
    });
    const response = await PATCH(request, { params: { id: '7' } });

    expect(response.status).toBe(200);
    // Ownership lives on the menu, so the lookup has to join it.
    expect((prismaMock.shoppingListItem.findUnique.mock.calls[0][0] as any).include).toEqual({
      menu: { select: { user_id: true } }
    });
    expect(prismaMock.shoppingListItem.update).toHaveBeenCalledTimes(1);
  });

  it('PATCH 403s when the item belongs to another user\'s menu', async () => {
    const { PATCH } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(
      itemRow({ menu: { user_id: OTHER_USER } })
    );

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'PATCH',
      headers: await authHeaders(OWNER),
      body: { is_checked: true }
    });
    const response = await PATCH(request, { params: { id: '7' } });

    expect(response.status).toBe(403);
    expect(prismaMock.shoppingListItem.update).not.toHaveBeenCalled();
  });

  it('PATCH 403s even when the menu is public — sharing is read-only', async () => {
    const { PATCH } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(
      itemRow({ menu: { user_id: OTHER_USER, is_public: true } })
    );

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'PATCH',
      headers: await authHeaders(OWNER),
      body: { is_checked: true }
    });

    expect((await PATCH(request, { params: { id: '7' } })).status).toBe(403);
    expect(prismaMock.shoppingListItem.update).not.toHaveBeenCalled();
  });

  it('PATCH 404s for a missing item', async () => {
    const { PATCH } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/999', {
      method: 'PATCH',
      headers: await authHeaders(OWNER),
      body: { is_checked: true }
    });

    expect((await PATCH(request, { params: { id: '999' } })).status).toBe(404);
  });

  it('PATCH still 400s on a non-boolean is_checked for the owner', async () => {
    const { PATCH } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(itemRow());

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'PATCH',
      headers: await authHeaders(OWNER),
      body: { is_checked: 'yes' }
    });

    expect((await PATCH(request, { params: { id: '7' } })).status).toBe(400);
  });

  it('PATCH 401s without a token', async () => {
    const { PATCH } = await import('@/app/api/shopping-list/items/[id]/route');

    const response = await PATCH(
      createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
        method: 'PATCH',
        body: { is_checked: true }
      }),
      { params: { id: '7' } }
    );

    expect(response.status).toBe(401);
    expect(prismaMock.shoppingListItem.findUnique).not.toHaveBeenCalled();
  });

  it('PUT 403s when the item belongs to another user\'s menu', async () => {
    const { PUT } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(
      itemRow({ menu: { user_id: OTHER_USER } })
    );

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'PUT',
      headers: await authHeaders(OWNER),
      body: { ingredient_name: 'מלפפונים' }
    });

    expect((await PUT(request, { params: { id: '7' } })).status).toBe(403);
    expect(prismaMock.shoppingListItem.update).not.toHaveBeenCalled();
  });

  it('PUT updates the item for the owner', async () => {
    const { PUT } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(itemRow());
    prismaMock.shoppingListItem.update.mockResolvedValue(itemRow({ ingredient_name: 'מלפפונים' }));

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'PUT',
      headers: await authHeaders(OWNER),
      body: { ingredient_name: 'מלפפונים' }
    });
    const response = await PUT(request, { params: { id: '7' } });

    expect(response.status).toBe(200);
    expect((prismaMock.shoppingListItem.update.mock.calls[0][0] as any).data.ingredient_name).toBe(
      'מלפפונים'
    );
  });

  it('DELETE 403s when the item belongs to another user\'s menu', async () => {
    const { DELETE } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(
      itemRow({ menu: { user_id: OTHER_USER } })
    );

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'DELETE',
      headers: await authHeaders(OWNER)
    });

    expect((await DELETE(request, { params: { id: '7' } })).status).toBe(403);
    expect(prismaMock.shoppingListItem.delete).not.toHaveBeenCalled();
  });

  it('DELETE removes the item for the owner', async () => {
    const { DELETE } = await import('@/app/api/shopping-list/items/[id]/route');

    prismaMock.shoppingListItem.findUnique.mockResolvedValue(itemRow());
    prismaMock.shoppingListItem.delete.mockResolvedValue(itemRow());

    const request = createMockRequest('http://localhost:3000/api/shopping-list/items/7', {
      method: 'DELETE',
      headers: await authHeaders(OWNER)
    });

    expect((await DELETE(request, { params: { id: '7' } })).status).toBe(200);
    expect(prismaMock.shoppingListItem.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});

describe('GET /api/menus/shared/:token (unchanged public path)', () => {
  it('still serves a public menu by token with no session at all', async () => {
    const { GET } = await import('@/app/api/menus/shared/[token]/route');

    prismaMock.menu.findFirst.mockResolvedValue(
      menuRow({ user_id: OTHER_USER, is_public: true, share_token: 'tok123' })
    );

    const request = createMockRequest('http://localhost:3000/api/menus/shared/tok123');
    const response = await GET(request, { params: { token: 'tok123' } });

    expect(response.status).toBe(200);
    expect((prismaMock.menu.findFirst.mock.calls[0][0] as any).where).toEqual({
      share_token: 'tok123',
      is_public: true
    });
  });
});

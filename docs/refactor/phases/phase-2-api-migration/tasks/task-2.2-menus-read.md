# 📋 Task 2.2: Menus Read APIs

**מזהה**: TASK-2.2
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 2-3 hours
**Priority**: 🔴 High (Critical for menu functionality)

---

## 🎯 Goal

להעביר את כל ה-READ endpoints של Menus מ-Flask ל-Next.js - רשימת תפריטים, קריאת תפריט בודד, ושיתוף תפריט.

### Why This Task?
- **Core feature** - תפריטים הם פיצ'ר מרכזי באפליקציה
- **No external dependencies** - רק Prisma queries
- **Foundation for menu features** - שאר פיצ'רי התפריטים תלויים בזה
- **Can run in parallel** - אין תלות במשימות אחרות

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.3: Prisma Schema (schema ready)
- [x] TASK-1.4: Migration Script (data in PostgreSQL)
- [x] TASK-1.5: API Structure (utilities ready)
- [x] TASK-1.6: Types Setup (types ready)

**Nice to have:**
- [ ] TASK-1.7: Testing Setup (for writing tests)

---

## 📋 Endpoints to Migrate

### From `backend/ourRecipesBack/routes/menus.py`:

| Endpoint | Method | Flask Line | Description | Complexity |
|----------|--------|------------|-------------|------------|
| `` (list) | GET | ~179 | List user's menus + public menus | 🟡 Medium |
| `/<menu_id>` | GET | ~210 | Get single menu with full structure | 🟢 Easy |
| `/shared/<share_token>` | GET | ~235 | Get shared menu (no auth) | 🟢 Easy |

**Total**: 3 endpoints, ~70 lines Flask → ~150 lines Next.js

---

## 📋 Implementation Guide

### Step 1: Analyze Flask Implementation

**מה לעשות:**
- [x] קרא את `backend/ourRecipesBack/routes/menus.py`
- [x] הבן את הlogic של כל endpoint
- [x] שים לב לaccess control (user's menus vs public)

**Flask Reference - GET /menus (Line 179):**
```python
@menus_bp.route("", methods=["GET"])
@jwt_required()
def get_user_menus():
    """
    Get all menus for the current user.
    Returns:
    - User's own menus (both public and private)
    - All public menus created by other users (including guests)
    """
    try:
        user_id = get_jwt_identity()

        # Get menus that are either:
        # 1. Created by this user (regardless of public/private)
        # 2. Public menus created by anyone else
        menus = Menu.query.filter(
            or_(
                Menu.user_id == user_id,  # User's own menus
                Menu.is_public == True     # Public menus from anyone
            )
        ).order_by(Menu.created_at.desc()).all()

        return jsonify({
            "menus": [menu.to_dict(include_meals=False) for menu in menus]
        }), 200

    except Exception as e:
        print(f"Error fetching menus: {str(e)}")
        return jsonify({"error": "Failed to fetch menus", "message": str(e)}), 500
```

**Key points:**
- Returns user's own menus + public menus from others
- Ordered by created_at descending
- `include_meals=False` for list view (performance)

---

### Step 2: Create List Menus API Route

**קובץ ליצור:** `app/api/menus/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/menus
 * List user's menus + public menus
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  paginatedResponse
} from '@/lib/utils/api-response';
import { handleApiError, UnauthorizedError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const userId = session.user.id;

    // Pagination
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    logger.debug({ userId, skip, take }, 'Fetching user menus');

    // Get menus: user's own + public from others
    const where = {
      OR: [
        { user_id: userId },        // User's own menus
        { is_public: true }         // Public menus from anyone
      ]
    };

    const totalItems = await prisma.menu.count({ where });

    const menus = await prisma.menu.findMany({
      where,
      select: {
        id: true,
        user_id: true,
        name: true,
        event_type: true,
        description: true,
        total_servings: true,
        dietary_type: true,
        share_token: true,
        is_public: true,
        created_at: true,
        updated_at: true,
        telegram_message_id: true,
        // Don't include meals for list view (performance)
        _count: {
          select: {
            meals: true,
            shopping_list_items: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: menus.length, total: totalItems }, 'Menus fetched');

    return paginatedResponse(menus, page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Fetch menus failed');
    return handleApiError(error);
  }
}
```

**Key improvements over Flask:**
- ✅ Pagination added
- ✅ Type-safe with Prisma
- ✅ Auth with NextAuth session
- ✅ Structured logging
- ✅ Returns meal count without loading full data

---

### Step 3: Get Single Menu

**קובץ ליצור:** `app/api/menus/[id]/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/menus/:id
 * Get single menu with full structure (meals + recipes)
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError
} from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const userId = session.user.id;
    const menuId = validateId(params.id);

    logger.debug({ userId, menuId }, 'Fetching menu');

    // Get menu with full structure
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      include: {
        meals: {
          include: {
            recipes: {
              include: {
                recipe: {
                  select: {
                    id: true,
                    telegram_id: true,
                    title: true,
                    ingredients: true,
                    instructions: true,
                    categories: true,
                    difficulty: true,
                    cooking_time: true,
                    preparation_time: true,
                    servings: true,
                    image_url: true,
                    is_verified: true
                  }
                }
              },
              orderBy: {
                course_order: 'asc'
              }
            }
          },
          orderBy: {
            meal_order: 'asc'
          }
        },
        shopping_list_items: {
          orderBy: [
            { category: 'asc' },
            { ingredient_name: 'asc' }
          ]
        }
      }
    });

    if (!menu) {
      throw NotFoundError('Menu not found');
    }

    // Check access: owner or public
    if (menu.user_id !== userId && !menu.is_public) {
      logger.warn({ userId, menuId, owner: menu.user_id }, 'Access denied');
      throw ForbiddenError('Access denied');
    }

    logger.info({ menuId, userId }, 'Menu fetched successfully');

    return successResponse(menu);
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Note**: Full nested structure with meals, recipes, and shopping list.

---

### Step 4: Get Shared Menu (No Auth)

**קובץ ליצור:** `app/api/menus/shared/[token]/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/menus/shared/:token
 * Get shared menu by token (no authentication required)
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, NotFoundError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const shareToken = params.token;

    logger.debug({ shareToken }, 'Fetching shared menu');

    // Get menu by share token (must be public)
    const menu = await prisma.menu.findFirst({
      where: {
        share_token: shareToken,
        is_public: true  // Only public menus can be shared
      },
      include: {
        meals: {
          include: {
            recipes: {
              include: {
                recipe: {
                  select: {
                    id: true,
                    telegram_id: true,
                    title: true,
                    ingredients: true,
                    instructions: true,
                    categories: true,
                    difficulty: true,
                    cooking_time: true,
                    preparation_time: true,
                    servings: true,
                    image_url: true
                  }
                }
              },
              orderBy: {
                course_order: 'asc'
              }
            }
          },
          orderBy: {
            meal_order: 'asc'
          }
        },
        shopping_list_items: {
          orderBy: [
            { category: 'asc' },
            { ingredient_name: 'asc' }
          ]
        }
      }
    });

    if (!menu) {
      logger.warn({ shareToken }, 'Shared menu not found');
      throw NotFoundError('Menu not found or not shared');
    }

    logger.info({ menuId: menu.id, shareToken }, 'Shared menu fetched');

    return successResponse(menu);
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Key**: No authentication required, but menu must be public.

---

### Step 5: Create Tests

**קובץ ליצור:** `tests/integration/api/menus-read.test.ts`

**Tests to write:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as listGET } from '@/app/api/menus/route';
import { GET as singleGET } from '@/app/api/menus/[id]/route';
import { GET as sharedGET } from '@/app/api/menus/shared/[token]/route';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockMenus, mockMenu } from '@tests/mocks/data';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';
import { getServerSession } from 'next-auth';

// Mock NextAuth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn()
}));

describe('Menus Read APIs', () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'user123', name: 'Test User' }
    });
  });

  describe('GET /api/menus', () => {
    it('should return user menus + public menus', async () => {
      const menus = createMockMenus(15);
      prismaMock.menu.count.mockResolvedValue(15);
      prismaMock.menu.findMany.mockResolvedValue(menus.slice(0, 10));

      const request = createMockRequest(
        'http://localhost:3000/api/menus?page=1&pageSize=10'
      );
      const response = await listGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(10);
      expect(json.pagination.totalItems).toBe(15);
    });

    it('should filter menus correctly', async () => {
      prismaMock.menu.count.mockResolvedValue(5);
      prismaMock.menu.findMany.mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/menus');
      await listGET(request);

      // Verify OR query (user's menus OR public)
      expect(prismaMock.menu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ user_id: 'user123' }),
              expect.objectContaining({ is_public: true })
            ])
          })
        })
      );
    });

    it('should require authentication', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/menus');
      const response = await listGET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/menus/:id', () => {
    it('should return menu with full structure', async () => {
      prismaMock.menu.findUnique.mockResolvedValue({
        ...mockMenu,
        user_id: 'user123',
        meals: [],
        shopping_list_items: []
      });

      const request = createMockRequest('http://localhost:3000/api/menus/1');
      const response = await singleGET(request, { params: { id: '1' } });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data.id).toBe(mockMenu.id);
      expect(json.data).toHaveProperty('meals');
      expect(json.data).toHaveProperty('shopping_list_items');
    });

    it('should allow access to public menu', async () => {
      prismaMock.menu.findUnique.mockResolvedValue({
        ...mockMenu,
        user_id: 'other_user',
        is_public: true,
        meals: [],
        shopping_list_items: []
      });

      const request = createMockRequest('http://localhost:3000/api/menus/1');
      const response = await singleGET(request, { params: { id: '1' } });

      expect(response.status).toBe(200);
    });

    it('should deny access to private menu from another user', async () => {
      prismaMock.menu.findUnique.mockResolvedValue({
        ...mockMenu,
        user_id: 'other_user',
        is_public: false
      });

      const request = createMockRequest('http://localhost:3000/api/menus/1');
      const response = await singleGET(request, { params: { id: '1' } });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent menu', async () => {
      prismaMock.menu.findUnique.mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/menus/999');
      const response = await singleGET(request, { params: { id: '999' } });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/menus/shared/:token', () => {
    it('should return shared menu without auth', async () => {
      // No session required
      vi.mocked(getServerSession).mockResolvedValue(null);

      prismaMock.menu.findFirst.mockResolvedValue({
        ...mockMenu,
        share_token: 'abc123',
        is_public: true,
        meals: [],
        shopping_list_items: []
      });

      const request = createMockRequest(
        'http://localhost:3000/api/menus/shared/abc123'
      );
      const response = await sharedGET(request, { params: { token: 'abc123' } });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data.share_token).toBe('abc123');
    });

    it('should return 404 for private menu', async () => {
      prismaMock.menu.findFirst.mockResolvedValue(null);

      const request = createMockRequest(
        'http://localhost:3000/api/menus/shared/abc123'
      );
      const response = await sharedGET(request, { params: { token: 'abc123' } });

      expect(response.status).toBe(404);
    });

    it('should return 404 for invalid token', async () => {
      prismaMock.menu.findFirst.mockResolvedValue(null);

      const request = createMockRequest(
        'http://localhost:3000/api/menus/shared/invalid'
      );
      const response = await sharedGET(request, { params: { token: 'invalid' } });

      expect(response.status).toBe(404);
    });
  });
});
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] All 3 endpoints implemented
- [x] List menus returns user's + public menus
- [x] Single menu returns full structure (meals, recipes, shopping list)
- [x] Shared menu works without authentication
- [x] Access control works correctly
- [x] Pagination works

### Technical Requirements:
- [x] Tests pass (all 3 endpoints)
- [x] Type-safe with Prisma
- [x] Auth with NextAuth
- [x] Logging in place
- [x] Error handling works
- [x] No TypeScript errors

### Performance:
- [x] Response time < 100ms (list)
- [x] Response time < 200ms (single menu)
- [x] Efficient queries (no N+1)

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: List Menus**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/menus?page=1&pageSize=10"

# Expected: JSON with user's menus + public menus
```

**Test 2: Get Single Menu**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/menus/1"

# Expected: Full menu with meals, recipes, shopping list
```

**Test 3: Shared Menu (No Auth)**
```bash
curl "http://localhost:3000/api/menus/shared/abc123"

# Expected: Full menu if token is valid and menu is public
```

### Automated Testing:
```bash
npm run test tests/integration/api/menus-read.test.ts

# Expected: All tests pass
```

---

## 🔄 Rollback Strategy

**אם משהו משתבש:**

```bash
# Remove created files
rm -rf app/api/menus

# Frontend continues using Flask
# No impact on users
```

---

## 📊 Estimated Time

- **Minimum**: 1.5 hours (if smooth)
- **Expected**: 2 hours
- **Maximum**: 3 hours (with debugging)

**Breakdown:**
- List endpoint: 45 min
- Single menu endpoint: 30 min
- Shared menu endpoint: 30 min
- Tests: 45 min
- Testing & debugging: 30 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Access Control:**
```typescript
// User can access:
// - Their own menus (public or private)
// - Public menus from others
// - Shared menus (via token, no auth)

// Prisma query:
where: {
  OR: [
    { user_id: userId },     // Own menus
    { is_public: true }      // Public menus
  ]
}
```

**2. Performance:**
- List view: Don't include meals (use `_count` instead)
- Single view: Include full structure (meals + recipes)
- Add indexes on `user_id`, `is_public`, `share_token`

**3. Nested Relations:**
```typescript
// Prisma makes this easy:
include: {
  meals: {
    include: {
      recipes: {
        include: { recipe: true },
        orderBy: { course_order: 'asc' }
      }
    },
    orderBy: { meal_order: 'asc' }
  }
}
```

**4. Share Token:**
- Unique 32-char string
- Only works if menu is public
- No authentication required

### Potential Issues:

**Issue 1**: N+1 query problem with nested data
- **Solution**: Use Prisma's `include` to fetch all data in one query

**Issue 2**: Performance slow with large menus
- **Solution**: Add indexes, use pagination

**Issue 3**: Share token collision (unlikely)
- **Solution**: Use UUID or crypto.randomBytes(16).toString('hex')

**Issue 4**: Frontend expects different response format
- **Solution**: Match Flask format or update frontend

### References:
- [Flask Source](../../../backend/ourRecipesBack/routes/menus.py) - Lines 179-250
- [Prisma Relations](https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries)
- [CURRENT_STATE.md](../../CURRENT_STATE.md#menus-routes) - Full endpoint details

---

## 🔗 Related Tasks

**Depends on:**
- Phase 1 (all infrastructure tasks)

**Blocks:**
- TASK-2.8: Menu AI Operations (uses these endpoints)
- TASK-2.4: Shopping List CRUD (extends menu endpoints)

**Can run in parallel with:**
- TASK-2.1: Recipes Read APIs
- TASK-2.3: Categories & Basic APIs
- TASK-2.5: Versions APIs
- TASK-2.6: Auth APIs

---

## ✏️ AI Agent Instructions

```
Task: Migrate Menus Read APIs from Flask to Next.js

Context:
- Flask endpoints in: backend/ourRecipesBack/routes/menus.py
- Migrate 3 GET endpoints: list, single, shared
- Use Prisma for database (already setup)
- Follow Phase 1 API structure patterns

Your job:
1. Create app/api/menus/route.ts (GET)
2. Create app/api/menus/[id]/route.ts (GET)
3. Create app/api/menus/shared/[token]/route.ts (GET)
4. Add pagination to list view
5. Implement proper access control
6. Write integration tests for all endpoints
7. Verify response format matches Flask

Endpoints:
- GET /menus: List user's menus + public menus (paginated)
- GET /menus/:id: Get menu with meals, recipes, shopping list
- GET /menus/shared/:token: Get shared menu (no auth)

Access Control:
- List: User's own menus + public menus from others
- Single: Owner OR public menu
- Shared: Public menu only, via share_token

Constraints:
- Use NextAuth for authentication (except shared endpoint)
- Use Prisma with nested includes
- Add structured logging
- Handle 401, 403, 404 errors
- Order meals by meal_order, recipes by course_order
- Include shopping_list_items in single view

Critical:
- List view: Don't load meals (performance)
- Single view: Load full nested structure
- Shared: No auth required, token must match public menu
- Use findFirst for share_token (unique index)

Expected output:
- 3 route files created
- Tests passing
- Manual testing works
- Access control verified
- Response times < 200ms

Verification:
1. npm run test (integration tests pass)
2. curl localhost:3000/api/menus (with auth)
3. curl localhost:3000/api/menus/shared/TOKEN (no auth)
4. Check logs show structured data
5. Compare response format with Flask
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead
**Priority**: 🔴 HIGH - Critical path

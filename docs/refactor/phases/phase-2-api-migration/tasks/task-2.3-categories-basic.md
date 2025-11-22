# 📋 Task 2.3: Categories & Basic APIs

**מזהה**: TASK-2.3
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 1-2 hours
**Priority**: 🟡 Medium (Nice to have, not blocking)

---

## 🎯 Goal

להעביר את ה-endpoints הבסיסיים והפשוטים ביותר מ-Flask ל-Next.js - Categories ו-Health Check.

### Why This Task?
- **Quick win** - endpoints פשוטים מאוד, קל להשלים
- **No dependencies** - אין תלויות חיצוניות
- **Foundation for filters** - Categories משמשים לסינון מתכונים
- **Can run in parallel** - אפשר לעשות בו-זמנית עם משימות אחרות

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.3: Prisma Schema (schema ready)
- [x] TASK-1.4: Migration Script (data in PostgreSQL)
- [x] TASK-1.5: API Structure (utilities ready)

**Nice to have:**
- [ ] TASK-1.7: Testing Setup (for writing tests)

---

## 📋 Endpoints to Migrate

### From `backend/ourRecipesBack/routes/categories.py`:

| Endpoint | Method | Flask Line | Description | Complexity |
|----------|--------|------------|-------------|------------|
| `` (categories) | GET | ~8 | Get all unique categories | 🟢 Easy |

### From basic routes (to create):

| Endpoint | Method | Description | Complexity |
|----------|--------|-------------|------------|
| `/ping` | GET | Health check endpoint | 🟢 Very Easy |

**Total**: 2 endpoints, ~25 lines Flask → ~60 lines Next.js

---

## 📋 Implementation Guide

### Step 1: Analyze Flask Implementation

**מה לעשות:**
- [x] קרא את `backend/ourRecipesBack/routes/categories.py`
- [x] הבן איך categories נאספים מכל המתכונים

**Flask Reference - GET /categories (Line 8):**
```python
@categories_bp.route('', methods=['GET'])
@jwt_required()
def get_categories():
    """Get all unique categories from recipes"""
    try:
        categories_set = set()
        recipes = Recipe.query.all()

        for recipe in recipes:
            if recipe._categories:
                categories_set.update(recipe.categories)

        return jsonify({"data": sorted(list(categories_set))}), 200

    except Exception as e:
        print(f"Error fetching categories: {str(e)}", flush=True)
        return jsonify({"error": "Failed to fetch categories"}), 500
```

**Key points:**
- Extracts categories from all recipes
- Categories are comma-separated string in DB
- Returns unique, sorted list
- Requires authentication

---

### Step 2: Create Categories API Route

**קובץ ליצור:** `app/api/categories/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/categories
 * Get all unique categories from recipes
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, UnauthorizedError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    logger.debug('Fetching categories');

    // Get all active recipes with categories
    const recipes = await prisma.recipe.findMany({
      where: {
        status: 'active',
        categories: {
          not: null
        }
      },
      select: {
        categories: true
      }
    });

    // Extract unique categories
    const categoriesSet = new Set<string>();

    recipes.forEach(recipe => {
      if (recipe.categories) {
        // Categories are comma-separated string
        const cats = recipe.categories.split(',').map(c => c.trim());
        cats.forEach(cat => {
          if (cat) categoriesSet.add(cat);
        });
      }
    });

    // Convert to sorted array
    const categories = Array.from(categoriesSet).sort((a, b) =>
      a.localeCompare(b, 'he')  // Hebrew-aware sorting
    );

    logger.info({ count: categories.length }, 'Categories fetched');

    return successResponse(categories);
  } catch (error) {
    logger.error({ error }, 'Fetch categories failed');
    return handleApiError(error);
  }
}
```

**Key improvements over Flask:**
- ✅ Only fetch active recipes
- ✅ Hebrew-aware sorting
- ✅ More efficient (select only categories field)
- ✅ Type-safe

---

### Step 3: Create Health Check Endpoint

**קובץ ליצור:** `app/api/ping/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/ping
 * Health check endpoint
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime()
    };

    logger.debug(healthData, 'Health check');

    return successResponse(healthData);
  } catch (error) {
    logger.error({ error }, 'Health check failed');

    // Return 503 Service Unavailable if DB is down
    return new Response(
      JSON.stringify({
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
```

**Features:**
- ✅ No authentication required
- ✅ Checks database connection
- ✅ Returns uptime
- ✅ Returns 503 if unhealthy

---

### Step 4: Create Tests

**קובץ ליצור:** `tests/integration/api/categories-basic.test.ts`

**Tests to write:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as categoriesGET } from '@/app/api/categories/route';
import { GET as pingGET } from '@/app/api/ping/route';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';
import { getServerSession } from 'next-auth';

// Mock NextAuth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn()
}));

describe('Categories & Basic APIs', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  describe('GET /api/categories', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'user123', name: 'Test User' }
      });
    });

    it('should return unique sorted categories', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        { categories: 'עיקריות,מרקים' },
        { categories: 'קינוחים' },
        { categories: 'עיקריות,סלטים' },
        { categories: 'מרקים' }
      ]);

      const request = createMockRequest('http://localhost:3000/api/categories');
      const response = await categoriesGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);

      // Should have unique categories: עיקריות, מרקים, קינוחים, סלטים
      expect(json.data).toHaveLength(4);
      expect(json.data).toContain('עיקריות');
      expect(json.data).toContain('מרקים');
      expect(json.data).toContain('קינוחים');
      expect(json.data).toContain('סלטים');

      // Should be sorted
      expect(json.data).toEqual([...json.data].sort((a, b) =>
        a.localeCompare(b, 'he')
      ));
    });

    it('should handle empty categories', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        { categories: null },
        { categories: '' },
        { categories: 'עיקריות' }
      ]);

      const request = createMockRequest('http://localhost:3000/api/categories');
      const response = await categoriesGET(request);

      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(1);
      expect(json.data[0]).toBe('עיקריות');
    });

    it('should require authentication', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/categories');
      const response = await categoriesGET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/ping', () => {
    it('should return health status when DB is up', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const request = createMockRequest('http://localhost:3000/api/ping');
      const response = await pingGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data.status).toBe('ok');
      expect(json.data.database).toBe('connected');
      expect(json.data).toHaveProperty('timestamp');
      expect(json.data).toHaveProperty('uptime');
    });

    it('should return 503 when DB is down', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const request = createMockRequest('http://localhost:3000/api/ping');
      const response = await pingGET(request);

      expect(response.status).toBe(503);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe('error');
      expect(json.database).toBe('disconnected');
    });

    it('should work without authentication', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const request = createMockRequest('http://localhost:3000/api/ping');
      const response = await pingGET(request);

      expect(response.status).toBe(200);
      // No auth check should be called
    });
  });
});
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] Both endpoints implemented
- [x] Categories returns unique, sorted list
- [x] Ping returns health status
- [x] Ping checks database connection
- [x] Ping returns 503 if DB is down

### Technical Requirements:
- [x] Tests pass (both endpoints)
- [x] Type-safe with Prisma
- [x] Logging in place
- [x] Error handling works
- [x] No TypeScript errors

### Performance:
- [x] Response time < 50ms (ping)
- [x] Response time < 100ms (categories)

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: Categories**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/categories"

# Expected: { "data": ["קינוחים", "עיקריות", "סלטים", ...] }
```

**Test 2: Ping**
```bash
curl "http://localhost:3000/api/ping"

# Expected: {
#   "data": {
#     "status": "ok",
#     "database": "connected",
#     "timestamp": "2025-11-22T...",
#     "uptime": 123.45
#   }
# }
```

### Automated Testing:
```bash
npm run test tests/integration/api/categories-basic.test.ts

# Expected: All tests pass
```

---

## 🔄 Rollback Strategy

**אם משהו משתבש:**

```bash
# Remove created files
rm -rf app/api/categories
rm -rf app/api/ping

# Frontend continues using Flask
# No impact on users
```

---

## 📊 Estimated Time

- **Minimum**: 45 min (if smooth)
- **Expected**: 1 hour
- **Maximum**: 2 hours (with debugging)

**Breakdown:**
- Categories endpoint: 20 min
- Ping endpoint: 15 min
- Tests: 30 min
- Testing & debugging: 15 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Categories Extraction:**
```typescript
// Categories are stored as comma-separated string in DB:
// "עיקריות,מרקים,קינוחים"

// Need to:
// 1. Split by comma
// 2. Trim whitespace
// 3. Remove duplicates (Set)
// 4. Sort (Hebrew-aware)

const categories = recipe.categories.split(',').map(c => c.trim());
categoriesSet.add(...categories);
```

**2. Hebrew Sorting:**
```typescript
// Use localeCompare with 'he' locale for proper Hebrew sorting
array.sort((a, b) => a.localeCompare(b, 'he'));
```

**3. Health Check:**
```typescript
// Should check:
// - Database connection (critical)
// - Optionally: External services (Telegram, AI)

// Return 503 if unhealthy (not 500)
// This tells load balancers to stop routing traffic
```

**4. Caching Opportunity:**
```typescript
// Categories don't change often - can cache for 5-10 minutes
// Next.js API routes support revalidate:
export const revalidate = 300; // 5 minutes
```

### Potential Issues:

**Issue 1**: Categories with leading/trailing whitespace
- **Solution**: Use `.trim()` when splitting

**Issue 2**: Empty strings in categories
- **Solution**: Filter out empty strings

**Issue 3**: Ping endpoint shows false positive
- **Solution**: Actually query the DB, don't just check if prisma is defined

**Issue 4**: Categories not sorted properly in Hebrew
- **Solution**: Use `localeCompare(b, 'he')`

### References:
- [Flask Source](../../../backend/ourRecipesBack/routes/categories.py) - Categories
- [CURRENT_STATE.md](../../CURRENT_STATE.md#other-routes) - Basic endpoints

---

## 🔗 Related Tasks

**Depends on:**
- Phase 1 (infrastructure tasks)

**Blocks:**
- None (not blocking)

**Can run in parallel with:**
- TASK-2.1: Recipes Read APIs
- TASK-2.2: Menus Read APIs
- TASK-2.4: Shopping List CRUD
- TASK-2.5: Versions APIs
- TASK-2.6: Auth APIs

---

## ✏️ AI Agent Instructions

```
Task: Migrate Categories & Basic APIs from Flask to Next.js

Context:
- Flask categories endpoint in: backend/ourRecipesBack/routes/categories.py
- Need to create new ping endpoint for health checks
- Use Prisma for database
- Follow Phase 1 API structure patterns

Your job:
1. Create app/api/categories/route.ts (GET)
2. Create app/api/ping/route.ts (GET)
3. Write integration tests for both
4. Verify response format matches Flask (categories)

Endpoints:
- GET /categories: Extract unique categories from all recipes, return sorted
- GET /ping: Health check with database connection test

Categories Implementation:
- Get all active recipes
- Extract categories (comma-separated strings)
- Split, trim, deduplicate
- Sort with Hebrew awareness
- Require authentication

Ping Implementation:
- No authentication required
- Check database with: await prisma.$queryRaw`SELECT 1`
- Return { status, database, timestamp, uptime }
- Return 503 if database is down

Constraints:
- Categories: Use NextAuth for auth
- Ping: No auth required
- Hebrew-aware sorting: localeCompare(b, 'he')
- Structured logging
- Handle empty/null categories gracefully

Critical:
- Categories are comma-separated strings in DB
- Must trim whitespace after splitting
- Filter out empty strings
- Ping must actually query DB (not just check if prisma exists)

Expected output:
- 2 route files created
- Tests passing
- Manual testing works
- Response times < 100ms

Verification:
1. npm run test (integration tests pass)
2. curl localhost:3000/api/categories (with auth)
3. curl localhost:3000/api/ping (no auth)
4. Check logs show structured data
5. Verify categories are unique and sorted
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead
**Priority**: 🟡 MEDIUM - Nice to have

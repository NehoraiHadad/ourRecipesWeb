# 📋 Task 2.1: Recipes Read APIs

**מזהה**: TASK-2.1
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 3-4 hours
**Priority**: 🔴 High (Critical - Foundation for frontend)

---

## 🎯 Goal

להעביר את כל ה-READ endpoints של Recipes מ-Flask ל-Next.js - חיפוש, autocomplete, קריאת מתכון בודד, ורשימת מתכונים.

### Why This Task?
- **Most used endpoints** - Frontend קורא recipes כל הזמן
- **No external dependencies** - רק Prisma queries
- **Foundation** - שאר ה-features תלויים בזה
- **Quick win** - יכול להשלים במהרה

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

### From `backend/ourRecipesBack/routes/recipes.py`:

| Endpoint | Method | Flask Line | Description | Complexity |
|----------|--------|------------|-------------|------------|
| `/search` | GET | ~45 | Search recipes with filters | 🟡 Medium |
| `/search/suggestions` | GET | ~280 | Autocomplete suggestions | 🟢 Easy |
| `/<telegram_id>` | GET | ~355 | Get single recipe | 🟢 Easy |
| `/manage` | GET | ~320 | List user's recipes | 🟢 Easy |

**Total**: 4 endpoints, ~150 lines Flask → ~200 lines Next.js

---

## 📋 Implementation Guide

### Step 1: Analyze Flask Implementation

**מה לעשות:**
- [ ] קרא את `backend/ourRecipesBack/routes/recipes.py`
- [ ] הבן את הquery logic לכל endpoint
- [ ] זהה filters, pagination, sorting

**Flask Reference - GET /search:**
```python
# Line ~45
@recipes_bp.route('/search', methods=['GET'])
def search_recipes():
    query = request.args.get('query', '')
    category = request.args.get('category')
    difficulty = request.args.get('difficulty')

    recipes = Recipe.query

    if query:
        recipes = recipes.filter(
            or_(
                Recipe.title.ilike(f'%{query}%'),
                Recipe._ingredients.ilike(f'%{query}%')
            )
        )

    if category:
        recipes = recipes.filter(Recipe._categories.ilike(f'%{category}%'))

    if difficulty:
        recipes = recipes.filter(Recipe.difficulty == difficulty)

    return jsonify([r.to_dict() for r in recipes.all()])
```

**Key points:**
- Case-insensitive search (ilike)
- Search in title + ingredients
- Category filter (comma-separated string)
- Difficulty filter (enum)
- No pagination in Flask (we should add!)

---

### Step 2: Create Search API Route

**קובץ ליצור:** `app/api/recipes/search/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/recipes/search
 * Search recipes with filters
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  paginatedResponse
} from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { Prisma, RecipeDifficulty } from '@prisma/client';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract search parameters
    const query = searchParams.get('query') || '';
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty') as RecipeDifficulty | null;

    // Pagination (add this - Flask doesn't have it!)
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    // Build where clause
    const where: Prisma.RecipeWhereInput = {
      status: 'active', // Only active recipes
    };

    // Text search (in title or ingredients)
    if (query) {
      where.OR = [
        {
          title: {
            contains: query,
            mode: 'insensitive' // Case-insensitive
          }
        },
        {
          ingredients: {
            contains: query,
            mode: 'insensitive'
          }
        },
        {
          raw_content: {
            contains: query,
            mode: 'insensitive'
          }
        }
      ];
    }

    // Category filter
    if (category) {
      where.categories = {
        contains: category,
        mode: 'insensitive'
      };
    }

    // Difficulty filter
    if (difficulty && Object.values(RecipeDifficulty).includes(difficulty)) {
      where.difficulty = difficulty;
    }

    logger.debug({ where, skip, take }, 'Searching recipes');

    // Get total count
    const totalItems = await prisma.recipe.count({ where });

    // Get recipes
    const recipes = await prisma.recipe.findMany({
      where,
      select: {
        id: true,
        telegram_id: true,
        title: true,
        categories: true,
        difficulty: true,
        cooking_time: true,
        preparation_time: true,
        servings: true,
        image_url: true,
        created_at: true,
        is_verified: true
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: recipes.length, total: totalItems }, 'Search completed');

    return paginatedResponse(recipes, page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Recipe search failed');
    return handleApiError(error);
  }
}
```

**Key improvements over Flask:**
- ✅ Pagination added
- ✅ Type-safe with Prisma
- ✅ Structured logging
- ✅ Error handling
- ✅ Select only needed fields (performance)

---

### Step 3: Create Autocomplete Suggestions

**קובץ ליצור:** `app/api/recipes/search/suggestions/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/recipes/search/suggestions
 * Autocomplete suggestions for search
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';

    if (query.length < 2) {
      // Don't search for single character
      return successResponse([]);
    }

    logger.debug({ query }, 'Getting autocomplete suggestions');

    // Get top 10 matching titles
    const suggestions = await prisma.recipe.findMany({
      where: {
        status: 'active',
        title: {
          contains: query,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        title: true,
        telegram_id: true,
        image_url: true
      },
      take: 10,
      orderBy: {
        created_at: 'desc'
      }
    });

    logger.debug({ count: suggestions.length }, 'Suggestions found');

    return successResponse(suggestions);
  } catch (error) {
    logger.error({ error }, 'Autocomplete failed');
    return handleApiError(error);
  }
}
```

---

### Step 4: Get Single Recipe

**קובץ ליצור:** `app/api/recipes/[telegram_id]/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/recipes/:telegram_id
 * Get single recipe by telegram_id
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, NotFoundError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const telegramId = validateId(params.telegram_id);

    logger.debug({ telegramId }, 'Fetching recipe');

    const recipe = await prisma.recipe.findUnique({
      where: {
        telegram_id: telegramId
      },
      include: {
        user_recipes: {
          select: {
            user_id: true,
            is_favorite: true
          }
        },
        versions: {
          select: {
            id: true,
            version_num: true,
            created_at: true,
            change_description: true
          },
          orderBy: {
            version_num: 'desc'
          },
          take: 5 // Latest 5 versions
        }
      }
    });

    if (!recipe) {
      logger.warn({ telegramId }, 'Recipe not found');
      throw NotFoundError('Recipe not found');
    }

    logger.info({ recipeId: recipe.id, telegramId }, 'Recipe fetched');

    return successResponse(recipe);
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Note**: Using `telegram_id` (not `id`) for compatibility with Flask.

---

### Step 5: List User Recipes

**קובץ ליצור:** `app/api/recipes/manage/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/recipes/manage
 * List all recipes for management (admin view)
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paginatedResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    // Optional filters
    const status = searchParams.get('status') || 'active';

    logger.debug({ status, skip, take }, 'Listing recipes for management');

    const where = {
      status
    };

    const totalItems = await prisma.recipe.count({ where });

    const recipes = await prisma.recipe.findMany({
      where,
      select: {
        id: true,
        telegram_id: true,
        title: true,
        categories: true,
        is_parsed: true,
        is_verified: true,
        sync_status: true,
        created_at: true,
        updated_at: true,
        image_url: true
      },
      orderBy: {
        updated_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: recipes.length, total: totalItems }, 'Management list fetched');

    return paginatedResponse(recipes, page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Management list failed');
    return handleApiError(error);
  }
}
```

---

### Step 6: Create Tests

**קובץ ליצור:** `tests/integration/api/recipes-read.test.ts`

**Tests to write:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GET as searchGET } from '@/app/api/recipes/search/route';
import { GET as suggestionsGET } from '@/app/api/recipes/search/suggestions/route';
import { GET as singleGET } from '@/app/api/recipes/[telegram_id]/route';
import { GET as manageGET } from '@/app/api/recipes/manage/route';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRecipes, mockRecipe } from '@tests/mocks/data';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

describe('Recipes Read APIs', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  describe('GET /api/recipes/search', () => {
    it('should return paginated recipes', async () => {
      const recipes = createMockRecipes(20);
      prismaMock.recipe.count.mockResolvedValue(20);
      prismaMock.recipe.findMany.mockResolvedValue(recipes.slice(0, 10));

      const request = createMockRequest(
        'http://localhost:3000/api/recipes/search?page=1&pageSize=10'
      );
      const response = await searchGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(10);
      expect(json.pagination.totalItems).toBe(20);
    });

    it('should filter by query', async () => {
      prismaMock.recipe.count.mockResolvedValue(5);
      prismaMock.recipe.findMany.mockResolvedValue([]);

      const request = createMockRequest(
        'http://localhost:3000/api/recipes/search?query=pasta'
      );
      await searchGET(request);

      // Verify query contains pasta
      expect(prismaMock.recipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                title: expect.objectContaining({ contains: 'pasta' })
              })
            ])
          })
        })
      );
    });

    it('should filter by category', async () => {
      prismaMock.recipe.count.mockResolvedValue(3);
      prismaMock.recipe.findMany.mockResolvedValue([]);

      const request = createMockRequest(
        'http://localhost:3000/api/recipes/search?category=dessert'
      );
      await searchGET(request);

      expect(prismaMock.recipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categories: expect.objectContaining({ contains: 'dessert' })
          })
        })
      );
    });
  });

  describe('GET /api/recipes/search/suggestions', () => {
    it('should return autocomplete suggestions', async () => {
      const recipes = createMockRecipes(5);
      prismaMock.recipe.findMany.mockResolvedValue(recipes);

      const request = createMockRequest(
        'http://localhost:3000/api/recipes/search/suggestions?query=ch'
      );
      const response = await suggestionsGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(5);
    });

    it('should return empty for short query', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/recipes/search/suggestions?query=a'
      );
      const response = await suggestionsGET(request);

      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(0);
    });
  });

  describe('GET /api/recipes/:telegram_id', () => {
    it('should return recipe with relations', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue({
        ...mockRecipe,
        user_recipes: [],
        versions: []
      });

      const request = createMockRequest('http://localhost:3000/api/recipes/12345');
      const response = await singleGET(request, { params: { telegram_id: '12345' } });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data.telegram_id).toBe(12345);
    });

    it('should return 404 for non-existent recipe', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/recipes/99999');
      const response = await singleGET(request, { params: { telegram_id: '99999' } });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/recipes/manage', () => {
    it('should return management list', async () => {
      const recipes = createMockRecipes(10);
      prismaMock.recipe.count.mockResolvedValue(10);
      prismaMock.recipe.findMany.mockResolvedValue(recipes);

      const request = createMockRequest('http://localhost:3000/api/recipes/manage');
      const response = await manageGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(10);
    });
  });
});
```

---

### Step 7: Update Frontend (Optional - can do later)

**מה לעשות:**
- [ ] Update API client to use Next.js endpoints
- [ ] Test in browser

**Example:**
```typescript
// frontend/ourRecipesFront/src/services/recipeService.ts

// Before (Flask):
const API_BASE = 'https://flask-backend.render.com/api';

// After (Next.js):
const API_BASE = '/api';  // Same origin

export async function searchRecipes(params: SearchParams) {
  const url = new URL(`${API_BASE}/recipes/search`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, String(value));
  });

  const response = await fetch(url);
  return response.json();
}
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] All 4 endpoints implemented
- [x] Search works with filters (query, category, difficulty)
- [x] Autocomplete returns suggestions
- [x] Single recipe fetch works
- [x] Management list works
- [x] Pagination works correctly

### Technical Requirements:
- [x] Tests pass (all 4 endpoints)
- [x] Type-safe with Prisma
- [x] Logging in place
- [x] Error handling works
- [x] No TypeScript errors

### Performance:
- [x] Response time < 200ms (search)
- [x] Response time < 50ms (single recipe)
- [x] Handles 100+ concurrent requests

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: Search**
```bash
curl "http://localhost:3000/api/recipes/search?query=pasta&page=1&pageSize=10"

# Expected: JSON with data array and pagination
```

**Test 2: Autocomplete**
```bash
curl "http://localhost:3000/api/recipes/search/suggestions?query=ch"

# Expected: Array of recipes with titles matching "ch"
```

**Test 3: Single Recipe**
```bash
curl "http://localhost:3000/api/recipes/12345"

# Expected: Full recipe object with relations
```

**Test 4: Management List**
```bash
curl "http://localhost:3000/api/recipes/manage?page=1&pageSize=20"

# Expected: Paginated list of recipes
```

### Automated Testing:
```bash
npm run test tests/integration/api/recipes-read.test.ts

# Expected: All tests pass
```

---

## 🔄 Rollback Strategy

**אם משהו משתבש:**

```bash
# Remove created files
rm -rf app/api/recipes/search
rm -rf app/api/recipes/[telegram_id]
rm -rf app/api/recipes/manage

# Frontend continues using Flask
# No impact on users
```

---

## 📊 Estimated Time

- **Minimum**: 2 hours (if smooth)
- **Expected**: 3 hours
- **Maximum**: 4 hours (with debugging)

**Breakdown:**
- Search endpoint: 1 hour
- Autocomplete: 30 min
- Single recipe: 30 min
- Management list: 30 min
- Tests: 1 hour
- Testing & debugging: 30 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Prisma vs SQLAlchemy Queries:**
```python
# Flask (SQLAlchemy)
Recipe.query.filter(Recipe.title.ilike(f'%{query}%'))

# Next.js (Prisma)
prisma.recipe.findMany({
  where: {
    title: { contains: query, mode: 'insensitive' }
  }
})
```

**2. Pagination:**
- Flask: No pagination (returns all)
- Next.js: Add pagination (better performance)

**3. Field Selection:**
- Flask: Returns all fields (`r.to_dict()`)
- Next.js: Select only needed fields (optimize)

**4. Error Handling:**
- Flask: Simple try-catch
- Next.js: Centralized with `handleApiError()`

### Potential Issues:

**Issue 1**: Case-insensitive search not working
- **Solution**: Use `mode: 'insensitive'` in Prisma

**Issue 2**: Categories filter doesn't match
- **Solution**: Categories are comma-separated string, use `contains`

**Issue 3**: Performance slow with many recipes
- **Solution**: Add indexes in Prisma schema, use pagination

**Issue 4**: Frontend expects different response format
- **Solution**: Keep response format compatible, or update frontend

### References:
- [Flask Source](../../../backend/ourRecipesBack/routes/recipes.py) - Lines 45-360
- [Prisma Filtering](https://www.prisma.io/docs/concepts/components/prisma-client/filtering-and-sorting)
- [CURRENT_STATE.md](../../CURRENT_STATE.md#recipes-routes) - Full endpoint details

---

## 🔗 Related Tasks

**Depends on:**
- Phase 1 (all infrastructure tasks)

**Blocks:**
- TASK-2.6: Auth APIs (uses recipes for testing)
- TASK-2.7: Recipe AI Operations (extends these endpoints)

**Can run in parallel with:**
- TASK-2.2: Menus Read APIs
- TASK-2.3: Categories & Basic APIs
- TASK-2.4: Shopping List CRUD
- TASK-2.5: Versions APIs

---

## ✏️ AI Agent Instructions

```
Task: Migrate Recipes Read APIs from Flask to Next.js

Context:
- Flask endpoints in: backend/ourRecipesBack/routes/recipes.py
- Migrate 4 GET endpoints: search, suggestions, single, manage
- Use Prisma for database (already setup)
- Follow Phase 1 API structure patterns

Your job:
1. Create app/api/recipes/search/route.ts (GET)
2. Create app/api/recipes/search/suggestions/route.ts (GET)
3. Create app/api/recipes/[telegram_id]/route.ts (GET)
4. Create app/api/recipes/manage/route.ts (GET)
5. Add pagination to search (Flask doesn't have it)
6. Write integration tests for all endpoints
7. Verify response format matches Flask

Endpoints:
- GET /search: Search with query, category, difficulty filters + pagination
- GET /search/suggestions: Autocomplete (min 2 chars, max 10 results)
- GET /:telegram_id: Single recipe with user_recipes and versions
- GET /manage: List all recipes for management (paginated)

Constraints:
- Use Prisma (not raw SQL)
- Use centralized error handling
- Add structured logging
- Case-insensitive search
- Return only needed fields (performance)
- Add pagination where missing

Critical:
- telegram_id is unique identifier (not id)
- Categories are comma-separated string
- Difficulty is enum (EASY, MEDIUM, HARD)
- Search in title, ingredients, raw_content

Expected output:
- 4 route files created
- Tests passing
- Manual testing works
- Response times < 200ms

Verification:
1. npm run test (integration tests pass)
2. curl localhost:3000/api/recipes/search?query=test
3. Check logs show structured data
4. Compare response format with Flask
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead
**Priority**: 🔴 HIGH - Critical path

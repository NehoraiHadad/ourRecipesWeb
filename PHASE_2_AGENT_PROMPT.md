# 🤖 Phase 2: API Migration - Agent Instructions

## 🎯 Mission

מימוש **Phase 2 - API Migration**: העברת כל ה-Flask API routes ל-Next.js API Routes.

---

## 📚 Required Reading - קרא לפני התחלה

### 1. Architecture & Context (בסדר הזה!)

```bash
# קרא את הקבצים האלה לפני שמתחילים:
1. docs/refactor/ARCHITECTURE_DECISION.md        # החלטות ארכיטקטוניות
2. docs/refactor/REFACTOR_PLAN.md                # התוכנית הכוללת
3. docs/refactor/CURRENT_STATE.md                # מיפוי Flask הקיים
4. frontend/ourRecipesFront/PHASE_1_COMPLETE.md  # מה הושלם ב-Phase 1
5. docs/refactor/phases/phase-2-api-migration/README.md  # Phase 2 plan
```

### 2. Phase 2 Tasks (תעדוף עבודה)

```bash
# קרא את כל ה-task files בתיקיה:
docs/refactor/phases/phase-2-api-migration/tasks/
├── task-2.1-recipes-crud.md          # עדיפות גבוהה
├── task-2.2-recipes-ai.md            # עדיפות בינונית
├── task-2.3-menus-crud.md            # עדיפות גבוהה
├── task-2.4-menus-ai.md              # עדיפות גבוהה (מורכב!)
├── task-2.5-categories.md            # עדיפות נמוכה (קל)
├── task-2.6-shopping-lists.md        # עדיפות בינונית
├── task-2.7-places.md                # עדיפות נמוכה
└── task-2.8-sync-placeholders.md     # עדיפות נמוכה
```

---

## 🏗️ Infrastructure Overview (מה כבר קיים)

### Phase 1 סיפק לך:

#### 1. **Database Layer** ✅
```typescript
// src/lib/prisma.ts - Prisma Client Singleton
import { prisma } from '@/lib/prisma';

// Use in API routes:
const recipes = await prisma.recipe.findMany();
```

**Schema:** `prisma/schema.prisma` - 10 models, 7 enums

#### 2. **API Utilities** ✅
```typescript
// Error handling
import { BadRequestError, NotFoundError, handleApiError } from '@/lib/utils/api-errors';

// Response helpers
import { successResponse, paginatedResponse } from '@/lib/utils/api-response';

// Validation
import { parseBody, validateRequiredFields, parsePaginationParams } from '@/lib/utils/api-validation';
```

#### 3. **Types** ✅
```typescript
// Database types
import { Recipe, Menu, RecipeWithRelations } from '@/lib/types';

// API types
import { CreateRecipeRequest, ApiResponse, PaginatedResponse } from '@/lib/types';
```

#### 4. **Logging** ✅
```typescript
import { logger } from '@/lib/logger';
import { logDatabaseQuery, measureExecutionTime } from '@/lib/utils/log-helpers';

logger.info({ userId: 123 }, 'User action');
```

#### 5. **Testing** ✅
```typescript
import { prismaMock } from '@tests/mocks/prisma';
import { createMockRecipe } from '@tests/mocks/data';
import { createMockRequest } from '@tests/helpers/api-test-helpers';
```

---

## 🎯 Your Task: Implement Phase 2

### Strategy: 3 Waves (מקל לקשה)

#### **Wave 1: Quick Wins (אפס תלויות)** 🟢
התחל כאן! אלו endpoints פשוטים - רק DB queries.

**Tasks:**
1. Categories API (`task-2.5-categories.md`)
2. Shopping Lists API (`task-2.6-shopping-lists.md`)
3. Recipe GET endpoints (search, get by id) מתוך `task-2.1-recipes-crud.md`
4. Menu GET endpoints (list, get by id, shared) מתוך `task-2.3-menus-crud.md`

**Estimated:** 6-8 hours

---

#### **Wave 2: AI Endpoints** 🟡
תלות ב-Gemini AI בלבד.

**Tasks:**
1. Recipe AI operations (`task-2.2-recipes-ai.md`)
   - Suggest recipe
   - Reformat recipe
   - Generate image
   - Refine recipe

2. Menu AI generation (`task-2.4-menus-ai.md`)
   - Generate menu preview (מורכב! יש function calling)

**Important:** Gemini SDK works in Node.js:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
```

**Estimated:** 12-16 hours

---

#### **Wave 3: Telegram Placeholders** 🔴
יש תלות ב-Telegram - יעבדו רק ב-Phase 4.

**Tasks:**
1. Recipe CREATE/UPDATE/DELETE - placeholder שקורא ל-Flask (זמני)
2. Menu SAVE/UPDATE/DELETE - placeholder
3. Places CRUD - placeholder
4. Sync endpoints - placeholder

**Strategy:**
```typescript
// app/api/recipes/route.ts
export async function POST(req: Request) {
  // Save to DB
  const recipe = await prisma.recipe.create({ data });

  // TODO (Phase 4): Send to Telegram via Python service
  // For now, call Flask endpoint or skip
  logger.warn('Telegram sync not implemented yet (Phase 4)');

  return successResponse(recipe);
}
```

**Estimated:** 8-10 hours

---

## 📋 Implementation Guidelines

### 1. **File Structure Pattern**

לכל resource, צור:

```
src/app/api/recipes/
├── route.ts              # GET (list), POST (create)
├── [id]/
│   └── route.ts          # GET, PUT, DELETE (single item)
├── search/
│   └── route.ts          # GET (search with params)
└── suggest/
    └── route.ts          # POST (AI operation)
```

### 2. **Route Handler Pattern**

```typescript
// src/app/api/recipes/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, paginatedResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parsePaginationParams, parseBody } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

/**
 * GET /api/recipes - List recipes with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const { page, pageSize, skip, take } = parsePaginationParams(url);

    logger.info({ page, pageSize }, 'Fetching recipes');

    const [recipes, total] = await Promise.all([
      prisma.recipe.findMany({
        skip,
        take,
        orderBy: { created_at: 'desc' }
      }),
      prisma.recipe.count()
    ]);

    return paginatedResponse(recipes, page, pageSize, total);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/recipes - Create new recipe
 */
export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<CreateRecipeRequest>(request);

    // Validate
    validateRequiredFields(body, ['telegram_id', 'raw_content']);

    // Create in DB
    const recipe = await prisma.recipe.create({
      data: {
        telegram_id: body.telegram_id,
        title: body.title,
        raw_content: body.raw_content,
        // ... more fields
      }
    });

    logger.info({ recipeId: recipe.id }, 'Recipe created');

    // TODO (Phase 4): Send to Telegram

    return successResponse(recipe, 'Recipe created', 201);
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 3. **Testing Pattern**

לכל route, צור test:

```typescript
// tests/integration/api/recipes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/recipes/route';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRecipe } from '@tests/mocks/data';
import { createMockRequest } from '@tests/helpers/api-test-helpers';

describe('Recipes API', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  describe('GET /api/recipes', () => {
    it('should return paginated recipes', async () => {
      const mockRecipes = [createMockRecipe()];

      prismaMock.recipe.findMany.mockResolvedValue(mockRecipes);
      prismaMock.recipe.count.mockResolvedValue(1);

      const request = createMockRequest('http://localhost:3000/api/recipes');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toHaveLength(1);
    });
  });

  describe('POST /api/recipes', () => {
    it('should create recipe', async () => {
      const newRecipe = {
        telegram_id: 12345,
        title: 'Test Recipe',
        raw_content: 'Content'
      };

      prismaMock.recipe.create.mockResolvedValue(createMockRecipe(newRecipe));

      const request = createMockRequest('http://localhost:3000/api/recipes', {
        method: 'POST',
        body: newRecipe
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });
  });
});
```

### 4. **Migration Reference**

לכל Flask route, תעזר במיפוי:

```python
# Flask (before) - backend/routes/recipes.py
@recipes_bp.route('/recipes/<telegram_id>', methods=['GET'])
def get_recipes(telegram_id):
    recipes = Recipe.query.filter_by(telegram_id=telegram_id).all()
    return jsonify([r.to_dict() for r in recipes])
```

```typescript
// Next.js (after) - app/api/recipes/[userId]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  const recipes = await prisma.recipe.findMany({
    where: { telegram_id: parseInt(params.userId) }
  });
  return successResponse(recipes);
}
```

**מיפוי מלא:** `docs/refactor/CURRENT_STATE.md` - טבלת כל ה-endpoints

---

## ⚠️ Critical Rules

### 1. **אל תשבור את Flask (עדיין רץ!)**
- Frontend עדיין משתמש ב-Flask
- אל תמחק/תשנה Flask routes
- זה migration הדרגתית

### 2. **Telegram Operations = Placeholder**
אם endpoint צריך Telegram:
```typescript
// Option 1: Call Flask temporarily
const response = await fetch('http://flask-url/api/recipes', {
  method: 'POST',
  body: JSON.stringify(data)
});

// Option 2: Skip for now
logger.warn('Telegram operation skipped - Phase 4');
```

### 3. **AI Operations = Gemini SDK**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
```

**Important:** קרא `backend/services/ai_service.py` ו-`backend/services/menu_planner_service.py` כדי להבין את הprompts!

### 4. **תמיד כתוב Tests**
לא עוברים ל-endpoint הבא בלי:
- ✅ Unit/Integration test
- ✅ Test passing
- ✅ No TypeScript errors

### 5. **סדר עבודה מומלץ**

```bash
# לכל endpoint:
1. קרא את ה-Flask route המקורי
2. קרא את task file (task-2.X)
3. כתוב את Next.js route
4. כתוב test
5. הרץ test
6. Commit
7. עבור ל-endpoint הבא

# Commits:
git commit -m "feat: implement GET /api/recipes endpoint"
git commit -m "test: add tests for recipes API"
```

---

## 📦 Environment Variables Needed

```env
# .env.local
DATABASE_URL="postgresql://..."
LOG_LEVEL=debug

# AI
GOOGLE_API_KEY="your-gemini-key"
HUGGINGFACE_TOKEN="your-hf-token"  # for image generation

# Telegram (Phase 4)
TELEGRAM_SERVICE_URL="http://localhost:8000"  # לעתיד
```

---

## 🧪 Verification Commands

```bash
# Before starting:
npm run prisma:generate  # Generate Prisma client
npm test                 # Tests should pass

# During development:
npm test -- recipes      # Run specific tests
npm run dev              # Test endpoints manually

# Final verification:
npm test                 # All tests pass
npm run build            # Build succeeds
npx tsc --noEmit        # No TypeScript errors
```

---

## 📊 Success Criteria

Phase 2 complete when:

- [ ] **Wave 1**: All simple CRUD endpoints work (Categories, Shopping Lists, GET endpoints)
- [ ] **Wave 2**: All AI endpoints work (Recipe AI, Menu AI)
- [ ] **Wave 3**: Telegram placeholders in place (warn/skip or call Flask)
- [ ] **Tests**: All endpoints have tests
- [ ] **Coverage**: >70% test coverage
- [ ] **Documentation**: API docs updated
- [ ] **Frontend**: Can switch from Flask to Next.js API (test manually)

---

## 🚫 What NOT to Do

1. ❌ **אל תמחק Flask routes** - עדיין נדרשים
2. ❌ **אל תיצור Python/Telegram service עכשיו** - זה Phase 4
3. ❌ **אל תשנה Prisma schema** - זה נעשה ב-Phase 1
4. ❌ **אל תשכח tests** - כל endpoint צריך test
5. ❌ **אל תעשה Big Bang** - endpoint אחד בכל פעם

---

## 📝 Task Execution Order (מומלץ)

### Day 1-2: Wave 1 - Quick Wins
```
✅ Task 2.5: Categories API (2 hours)
✅ Task 2.6: Shopping Lists API (3 hours)
✅ Task 2.1: Recipe GET endpoints only (3 hours)
```

### Day 3-4: Wave 1 continued + Wave 2 start
```
✅ Task 2.3: Menu GET endpoints (3 hours)
✅ Task 2.2: Recipe AI (simple ones: suggest, reformat) (4 hours)
```

### Day 5-7: Wave 2 - AI (Complex)
```
✅ Task 2.4: Menu AI Generation (8-12 hours) ⚠️ מורכב!
✅ Task 2.2: Recipe AI (complete: image, refine) (4 hours)
```

### Day 8-9: Wave 3 - Placeholders
```
✅ Task 2.1: Recipe POST/PUT/DELETE (placeholders) (3 hours)
✅ Task 2.3: Menu POST/PUT/DELETE (placeholders) (3 hours)
✅ Task 2.7: Places (placeholders) (2 hours)
✅ Task 2.8: Sync (placeholders) (2 hours)
```

### Day 10: Polish & Documentation
```
✅ Refactor & cleanup
✅ Add missing tests
✅ Update documentation
✅ Final verification
```

---

## 🆘 When Stuck

### Resources:
1. **Flask Reference**: `docs/refactor/CURRENT_STATE.md` - מיפוי מלא
2. **Gemini SDK**: https://ai.google.dev/tutorials/node_quickstart
3. **Next.js API Routes**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
4. **Prisma**: https://www.prisma.io/docs

### Ask for Help:
- תקוע ב-Gemini function calling? קרא `backend/services/menu_planner_service.py`
- תקוע ב-Prisma query? בדוק `prisma/schema.prisma`
- תקוע ב-types? בדוק `src/lib/types/`

---

## 🎯 Final Notes

**זכור:**
1. **Incremental** - endpoint אחד בכל פעם
2. **Test-Driven** - כתוב test לפני/אחרי הקוד
3. **Document as you go** - הוסף comments ו-JSDoc
4. **Commit often** - כל endpoint = commit
5. **Phase 4 exists** - אל תדאג לTelegram עכשיו

**Phase 2 Goal:** להעביר את כל הlogic ל-Next.js, להשאיר placeholders ל-Telegram.

---

## ✅ Checklist Before Starting

- [ ] קראתי את כל 5 מסמכי ההקשר
- [ ] קראתי את כל 8 task files של Phase 2
- [ ] הבנתי את ההבדל בין Wave 1/2/3
- [ ] הבנתי שPhase 4 = Telegram (לא עכשיו)
- [ ] Prisma client generated (`npm run prisma:generate`)
- [ ] Tests running (`npm test`)
- [ ] .env.local מוגדר עם GOOGLE_API_KEY

**Ready? התחל עם Wave 1 - Categories API!** 🚀

---

**Created**: 2025-11-23
**For**: Phase 2 Implementation Agent
**Prerequisites**: Phase 1 Complete ✅

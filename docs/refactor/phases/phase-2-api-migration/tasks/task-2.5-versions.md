# 📋 Task 2.5: Versions APIs

**מזהה**: TASK-2.5
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 2-3 hours
**Priority**: 🟡 Medium

---

## 🎯 Goal

להעביר את ה-Versions API endpoints מ-Flask ל-Next.js - קריאת גרסאות ויצירת גרסה חדשה (ללא restore שדורש Telegram).

### Why This Task?
- **Version control** - שמירת היסטוריה של שינויים במתכונים
- **Partial migration** - GET/POST ללא Telegram, restore ב-Phase 4
- **Can run in parallel** - אין תלויות

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.3: Prisma Schema (RecipeVersion model)
- [x] TASK-1.5: API Structure
- [x] TASK-2.1: Recipes Read APIs (for recipe access)

---

## 📋 Endpoints to Migrate

### From `backend/ourRecipesBack/routes/versions.py`:

| Endpoint | Method | Flask Line | Description | Telegram? | Complexity |
|----------|--------|------------|-------------|-----------|------------|
| `/recipe/<id>` | GET | ~11 | Get version history | ❌ | 🟢 Easy |
| `/recipe/<id>` | POST | ~32 | Create new version | ❌ | 🟢 Easy |
| `/recipe/<id>/restore/<version_id>` | POST | ~55 | Restore version | ✅ | ⚠️ Phase 4 |

**Note**: Restore endpoint דורש Telegram update - נעשה stub ב-Task 2.9.

---

## 📋 Implementation Guide

### Step 1: Get Recipe Versions

**קובץ ליצור:** `app/api/versions/recipe/[telegram_id]/route.ts`

```typescript
/**
 * GET /api/versions/recipe/:telegram_id
 * Get version history for a recipe
 *
 * POST /api/versions/recipe/:telegram_id
 * Create new version
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { successResponse, createdResponse } from '@/lib/utils/api-response';
import { handleApiError, NotFoundError, UnauthorizedError, BadRequestError } from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const telegramId = validateId(params.telegram_id);

    // Get recipe by telegram_id
    const recipe = await prisma.recipe.findUnique({
      where: { telegram_id: telegramId },
      select: { id: true }
    });

    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    // Get versions (latest first)
    const versions = await prisma.recipeVersion.findMany({
      where: { recipe_id: recipe.id },
      select: {
        id: true,
        recipe_id: true,
        version_num: true,
        content: true,
        created_at: true,
        created_by: true,
        change_description: true,
        is_current: true
      },
      orderBy: {
        version_num: 'desc'
      }
    });

    logger.info({ recipeId: recipe.id, versionsCount: versions.length }, 'Versions fetched');

    return successResponse(versions);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const telegramId = validateId(params.telegram_id);
    const body = await request.json();

    if (!body.content) {
      throw BadRequestError('Missing content');
    }

    // Get recipe
    const recipe = await prisma.recipe.findUnique({
      where: { telegram_id: telegramId }
    });

    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    // Get next version number
    const maxVersion = await prisma.recipeVersion.findFirst({
      where: { recipe_id: recipe.id },
      orderBy: { version_num: 'desc' },
      select: { version_num: true }
    });

    const nextVersionNum = (maxVersion?.version_num || 0) + 1;

    // Mark all versions as not current
    await prisma.recipeVersion.updateMany({
      where: { recipe_id: recipe.id },
      data: { is_current: false }
    });

    // Create new version
    const newVersion = await prisma.recipeVersion.create({
      data: {
        recipe_id: recipe.id,
        version_num: nextVersionNum,
        content: body.content,
        created_by: session.user.id,
        change_description: body.change_description || null,
        is_current: true
      }
    });

    logger.info(
      { recipeId: recipe.id, versionNum: nextVersionNum },
      'New version created'
    );

    // Return all versions
    const versions = await prisma.recipeVersion.findMany({
      where: { recipe_id: recipe.id },
      orderBy: { version_num: 'desc' }
    });

    return createdResponse(versions);
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

### Step 2: Restore Version (Stub)

**Note**: Restore endpoint ידרוש Telegram update ב-Phase 4. כרגע נשאיר stub ב-Task 2.9.

---

## ✅ Success Criteria

- [x] GET versions works
- [x] POST create version works
- [x] Versions ordered correctly (latest first)
- [x] is_current flag managed properly
- [x] Tests pass

---

## 📊 Estimated Time

- **Minimum**: 1.5 hours
- **Expected**: 2 hours
- **Maximum**: 3 hours

---

## 🔗 Related Tasks

**Depends on:**
- TASK-2.1: Recipes Read APIs

**Blocks:**
- None

**Related:**
- TASK-2.9: Telegram Stubs (restore endpoint)

---

## ✏️ AI Agent Instructions

```
Task: Migrate Versions APIs (GET, POST only)

Endpoints:
- GET /api/versions/recipe/:telegram_id
- POST /api/versions/recipe/:telegram_id

Constraints:
- Use telegram_id (not id) for recipe lookup
- Order versions by version_num DESC
- Manage is_current flag
- Store version content as JSON
- Auto-increment version_num

Note:
- Restore endpoint needs Telegram - defer to Task 2.9
```

---

**Created**: 2025-11-22
**Priority**: 🟡 MEDIUM

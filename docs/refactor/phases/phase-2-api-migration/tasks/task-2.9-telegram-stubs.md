# 📋 Task 2.9: Telegram Operation Stubs

**מזהה**: TASK-2.9
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 2-3 hours
**Priority**: 🟢 Low (Placeholders for Phase 4)

---

## 🎯 Goal

ליצור stub endpoints לכל ה-Telegram operations שיושלמו ב-Phase 4 (Python Microservice).

### Why This Task?
- **Complete API surface** - כל ה-endpoints קיימים (גם אם לא עובדים)
- **Clear error messages** - Frontend מקבל הודעה ברורה "Not implemented"
- **Planning for Phase 4** - רשימה ברורה של מה שצריך להשלים
- **Quick task** - רק stubs, לא לוגיקה מלאה

---

## 📦 Prerequisites

None - can run independently

---

## 📋 Endpoints to Create (Stubs)

### Group D: Telegram-Dependent Operations (from CURRENT_STATE.md)

**Recipes** (2 endpoints):
1. `POST /api/recipes/create` - Create + send to Telegram
2. `PUT /api/recipes/update/<telegram_id>` - Update + edit Telegram

**Menus** (4 endpoints):
1. `POST /api/menus/save` - Save + send to Telegram
2. `PUT /api/menus/<id>` - Update + edit Telegram
3. `DELETE /api/menus/<id>` - Delete + delete Telegram
4. Meal/Recipe updates - Update menu in Telegram

**Places** (3 endpoints):
1. `POST /api/places` - Create + backup to Telegram
2. `PUT /api/places/<id>` - Update + edit Telegram
3. `DELETE /api/places/<id>` - Soft delete + update Telegram

**Sync** (5 endpoints):
1. `POST /api/sync` - Incremental sync from Telegram
2. `POST /api/sync/full` - Full sync
3. `GET /api/sync/status` - Sync status
4. `GET /api/sync/session/status` - Session status
5. `POST /api/sync/session/refresh` - Refresh session

**Versions** (1 endpoint):
1. `POST /api/versions/recipe/<id>/restore/<version_id>` - Restore + update Telegram

**Total**: 15 endpoints (all stubs)

---

## 📋 Implementation Guide

### Step 1: Create Stub Response Helper

**קובץ ליצור:** `lib/utils/telegram-stub.ts`

```typescript
/**
 * Telegram Stub Response
 * Returns consistent "Not implemented" message for Telegram operations
 */
import { logger } from '@/lib/logger';

export function telegramNotImplemented(operation: string, phase: string = 'Phase 4') {
  logger.warn({ operation, phase }, 'Telegram operation not implemented');

  return new Response(
    JSON.stringify({
      error: 'Not Implemented',
      message: `This operation requires the Telegram microservice (${phase})`,
      operation,
      details: {
        reason: 'Telegram operations need Python/Telethon service',
        whenAvailable: phase,
        whatWorks: 'All database operations work, only Telegram sync is pending'
      }
    }),
    {
      status: 501, // Not Implemented
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
```

---

### Step 2: Create Stub Endpoints

**Example** - `app/api/recipes/create/route.ts`:
```typescript
/**
 * POST /api/recipes/create
 * Create recipe and send to Telegram
 *
 * STUB: Requires Telegram microservice (Phase 4)
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { telegramNotImplemented } from '@/lib/utils/telegram-stub';
import { UnauthorizedError } from '@/lib/utils/api-errors';

export async function POST(request: NextRequest) {
  // Still check auth (for consistency)
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw UnauthorizedError('Authentication required');
  }

  // Return stub response
  return telegramNotImplemented('POST /api/recipes/create');
}
```

**Apply same pattern to all 15 endpoints.**

---

### Step 3: Update Documentation

**קובץ לעדכן:** `docs/refactor/phases/phase-4-telegram-service/TELEGRAM_ENDPOINTS.md`

```markdown
# Telegram Endpoints to Implement in Phase 4

## Status: STUB (Not Implemented)

All these endpoints currently return 501 "Not Implemented".
They will be implemented in Phase 4 with the Python Telegram microservice.

## Recipes
- [ ] POST /api/recipes/create
- [ ] PUT /api/recipes/update/:telegram_id

## Menus
- [ ] POST /api/menus/save
- [ ] PUT /api/menus/:id
- [ ] DELETE /api/menus/:id
- [ ] POST /api/menus/:menu_id/meals/:meal_id/recipes
- [ ] PUT /api/menus/:menu_id/meals/:meal_id/recipes/:recipe_id
- [ ] DELETE /api/menus/:menu_id/meals/:meal_id/recipes/:recipe_id

## Places
- [ ] POST /api/places
- [ ] PUT /api/places/:id
- [ ] DELETE /api/places/:id

## Sync
- [ ] POST /api/sync
- [ ] POST /api/sync/full
- [ ] GET /api/sync/status
- [ ] GET /api/sync/session/status
- [ ] POST /api/sync/session/refresh

## Versions
- [ ] POST /api/versions/recipe/:id/restore/:version_id

## Implementation Plan (Phase 4)

Each endpoint will:
1. Accept request in Next.js API Route
2. Call Python Telegram microservice via HTTP
3. Handle Telegram response
4. Update database if needed
5. Return result to frontend

## Python Service API Design

```python
# telegram_service/main.py (FastAPI)

@app.post("/telegram/send-message")
async def send_message(data: MessageData):
    # Send to Telegram
    # Return message_id

@app.put("/telegram/edit-message")
async def edit_message(data: MessageEdit):
    # Edit in Telegram
    # Return success

@app.delete("/telegram/delete-message/{message_id}")
async def delete_message(message_id: int):
    # Delete from Telegram
    # Return success
```
```

---

## ✅ Success Criteria

- [x] All 15 stub endpoints created
- [x] Consistent error responses (501)
- [x] Auth still checked
- [x] Clear error messages
- [x] Documentation updated
- [x] Tests pass (expect 501)

---

## 📊 Estimated Time

- **Minimum**: 1.5 hours
- **Expected**: 2 hours
- **Maximum**: 3 hours

**Breakdown:**
- Stub helper: 15 min
- 15 endpoint stubs: 1 hour
- Documentation: 30 min
- Testing: 30 min

---

## 🔗 Related Tasks

**Depends on:**
- None (standalone)

**Blocks:**
- None (stubs only)

**Related:**
- Phase 4: Python Telegram Microservice (will implement these)

---

## ✏️ AI Agent Instructions

```
Task: Create Telegram Operation Stubs

Create:
1. lib/utils/telegram-stub.ts (helper)
2. 15 stub endpoint files (all return 501)
3. docs/refactor/phases/phase-4-telegram-service/TELEGRAM_ENDPOINTS.md

Stub endpoints:
- POST /api/recipes/create
- PUT /api/recipes/update/:telegram_id
- POST /api/menus/save
- PUT /api/menus/:id
- DELETE /api/menus/:id
- POST /api/places
- PUT /api/places/:id
- DELETE /api/places/:id
- POST /api/sync
- POST /api/sync/full
- GET /api/sync/status
- GET /api/sync/session/status
- POST /api/sync/session/refresh
- POST /api/versions/recipe/:id/restore/:version_id
- (+ meal/recipe operations in menus)

Each stub:
- Check auth (still require login)
- Return 501 with clear message
- Log operation
- Reference Phase 4

Documentation:
- List all endpoints
- Mark as "Not Implemented"
- Add implementation plan for Phase 4
```

---

**Created**: 2025-11-22
**Priority**: 🟢 LOW (Placeholders)

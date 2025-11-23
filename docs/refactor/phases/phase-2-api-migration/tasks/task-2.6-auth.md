# 📋 Task 2.6: Auth APIs

**מזהה**: TASK-2.6
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 3-4 hours
**Priority**: 🔴 High (Critical for user session management)

---

## 🎯 Goal

להעביר את ה-Auth validation ו-logout endpoints מ-Flask ל-Next.js. Login יהיה ב-Phase 3 (NextAuth.js).

### Why This Task?
- **Session management** - בדיקת authentication וlogout
- **Partial migration** - validate/logout בלבד, login ב-Phase 3
- **Critical path** - נדרש לפני שאר ה-features

---

## 📦 Prerequisites

- [x] TASK-1.5: API Structure
- [x] TASK-2.1: Recipes Read APIs (for testing auth)

---

## 📋 Endpoints to Migrate

### From `backend/ourRecipesBack/routes/auth.py`:

| Endpoint | Method | Flask Line | Description | Phase |
|----------|--------|------------|-------------|-------|
| `/login` | POST | ~18 | Telegram login | Phase 3 (NextAuth) |
| `/guest` | POST | ~107 | Guest login | Phase 3 (NextAuth) |
| `/validate` | GET | ~244 | Validate session | **Phase 2** |
| `/logout` | POST | ~185 | Logout | **Phase 2** |
| `/clear-permissions-cache` | POST | ~282 | Clear cache | Phase 3 |

---

## 📋 Implementation Guide

### Step 1: Validate Session Endpoint

**קובץ ליצור:** `app/api/auth/validate/route.ts`

```typescript
/**
 * GET /api/auth/validate
 * Validate current session and return user info
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { successResponse } from '@/lib/utils/api-response';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response(
        JSON.stringify({
          authenticated: false
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    logger.debug({ userId: session.user.id }, 'Session validated');

    return successResponse({
      authenticated: true,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image
      },
      canEdit: session.user.canEdit || false,
      expiresAt: session.expires
    });
  } catch (error) {
    logger.error({ error }, 'Session validation failed');
    return new Response(
      JSON.stringify({
        authenticated: false,
        error: 'Validation failed'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
```

---

### Step 2: Logout Endpoint

**Note**: NextAuth has built-in signOut, but we can create custom endpoint if needed.

**קובץ ליצור:** `app/api/auth/logout/route.ts`

```typescript
/**
 * POST /api/auth/logout
 * Logout user (clear session)
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { successResponse } from '@/lib/utils/api-response';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user) {
      logger.info({ userId: session.user.id }, 'User logged out');
    }

    // NextAuth handles session clearing via signOut() on client
    // This endpoint just confirms logout
    return successResponse({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error({ error }, 'Logout failed');
    return successResponse({
      success: true,
      message: 'Logged out'
    });
  }
}
```

**Note**: Client should use NextAuth's `signOut()` function. This endpoint is for compatibility.

---

## ✅ Success Criteria

- [x] Validate returns correct user info
- [x] Validate returns 401 if not authenticated
- [x] Logout works
- [x] Tests pass

---

## 📊 Estimated Time

- **Minimum**: 2 hours
- **Expected**: 3 hours
- **Maximum**: 4 hours

---

## 🔗 Related Tasks

**Blocks:**
- Most endpoints (need auth)

**Related:**
- Phase 3: NextAuth.js setup (login endpoints)

---

## ✏️ AI Agent Instructions

```
Task: Migrate Auth Validation & Logout

Endpoints:
- GET /api/auth/validate
- POST /api/auth/logout

Note:
- Login will be in Phase 3 with NextAuth.js
- Use getServerSession for session check
- Return 401 for unauthenticated (not 403)
```

---

**Created**: 2025-11-22
**Priority**: 🔴 HIGH

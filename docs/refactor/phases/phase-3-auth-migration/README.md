# 🔐 Phase 3: Authentication Migration (NextAuth.js)

**Timeline**: שבוע 4 (12-16 שעות)
**Status**: 📝 Planned
**Dependencies**: Phase 2 complete

---

## 🎯 Phase Goals

להעביר את מערכת ה-Authentication מ-Flask (JWT + Telegram) ל-NextAuth.js עם Custom Provider.

**קריטריון הצלחה**:
- Login עם Telegram Widget works
- Guest login works
- Session management with NextAuth
- Permission checks (canEdit) work
- Frontend מחובר ל-NextAuth

---

## 📊 Overview

### Current (Flask)
```
Frontend → Telegram Widget → POST /api/auth/login
                          ← JWT token (7 days)
                          → Store in cookie
Frontend → Use JWT for API calls
```

### Future (NextAuth.js)
```
Frontend → Telegram Widget → NextAuth.js Custom Provider
                          → Verify HMAC
                          → Check permissions (Telegram API)
                          → Create session (JWT)
                          ← Session cookie
Frontend → Use NextAuth session for API calls
```

---

## 📋 Tasks Breakdown

### Task 3.1: NextAuth.js Setup (2-3 hours)
**Goal**: Setup NextAuth.js with custom Telegram provider

**Steps**:
1. Install NextAuth.js
2. Create `app/api/auth/[...nextauth]/route.ts`
3. Configure providers array (empty for now)
4. Setup JWT strategy
5. Test basic setup

**Files to create**:
- `app/api/auth/[...nextauth]/route.ts`
- `lib/auth/auth-options.ts`

---

### Task 3.2: Custom Telegram Provider (4-5 hours)
**Goal**: Create custom provider for Telegram authentication

**Steps**:
1. Create Telegram credentials provider
2. Implement HMAC-SHA256 verification
3. Add user data extraction
4. Handle Telegram Widget response
5. Test login flow

**Files to create**:
- `lib/auth/telegram-provider.ts`
- `lib/auth/telegram-verify.ts`

**HMAC Verification**:
```typescript
import crypto from 'crypto';

function verifyTelegramAuth(data: any, botToken: string): boolean {
  const { hash, ...userData } = data;

  // Create data-check-string
  const dataCheckString = Object.keys(userData)
    .sort()
    .map(key => `${key}=${userData[key]}`)
    .join('\n');

  // Create secret key
  const secretKey = crypto
    .createHash('sha256')
    .update(botToken)
    .digest();

  // Calculate HMAC
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return hmac === hash;
}
```

---

### Task 3.3: Permission Checks (3-4 hours)
**Goal**: Implement edit permissions (Telegram channel membership)

**Steps**:
1. Create permission check service
2. Call Telegram API to check membership
3. Cache results (1 hour)
4. Add canEdit to session
5. Update API routes to check permissions

**Files to create**:
- `lib/services/permissionService.ts`
- `lib/utils/permissions-cache.ts`

**Permission Logic**:
```typescript
async function checkEditPermission(userId: string): Promise<boolean> {
  // Check cache first
  const cached = permissionsCache.get(userId);
  if (cached !== undefined) return cached;

  // Call Telegram API
  const isMember = await checkChannelMembership(userId, CHANNEL_ID);

  // Cache for 1 hour
  permissionsCache.set(userId, isMember, 3600);

  return isMember;
}
```

---

### Task 3.4: Guest Login (2-3 hours)
**Goal**: Implement guest authentication

**Steps**:
1. Create guest credentials provider
2. Generate guest UUID
3. Set canEdit: false
4. Add guest session handling
5. Test guest flow

**Files to create**:
- `lib/auth/guest-provider.ts`

---

### Task 3.5: Session Management (2-3 hours)
**Goal**: Setup JWT session with custom claims

**Steps**:
1. Configure JWT callbacks
2. Add custom session data (canEdit, authType)
3. Setup session expiration (7 days)
4. Add refresh logic
5. Test session persistence

**JWT Callbacks**:
```typescript
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.userId = user.id;
      token.canEdit = user.canEdit;
      token.authType = user.authType;
    }
    return token;
  },

  async session({ session, token }) {
    session.user.id = token.userId;
    session.user.canEdit = token.canEdit;
    session.user.authType = token.authType;
    return session;
  }
}
```

---

### Task 3.6: Frontend Integration (2-3 hours)
**Goal**: Update frontend to use NextAuth

**Steps**:
1. Install next-auth client
2. Wrap app with SessionProvider
3. Update login button (use signIn)
4. Update logout (use signOut)
5. Replace JWT checks with session checks
6. Test all flows

**Frontend Changes**:
```typescript
// Before (Flask JWT):
const token = localStorage.getItem('token');
const response = await fetch('/api/recipes', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// After (NextAuth):
const session = await getSession();
const response = await fetch('/api/recipes');
// NextAuth handles auth automatically via cookies
```

---

## 🔗 Integration Points

### With Phase 2:
- Use `/api/auth/validate` during migration
- Gradually replace JWT with NextAuth
- Both can coexist temporarily

### With Phase 4:
- Permission checks may call Python service
- Telegram API calls for membership

---

## ✅ Success Criteria

**Before moving to Phase 4:**

### Functional:
- [ ] Telegram login works
- [ ] Guest login works
- [ ] Sessions persist (7 days)
- [ ] canEdit permission works
- [ ] Logout works
- [ ] Frontend uses NextAuth

### Technical:
- [ ] NextAuth.js configured
- [ ] HMAC verification works
- [ ] Permission caching works
- [ ] Tests pass
- [ ] No breaking changes

### Verification:
```bash
# Login with Telegram works
# Guest login works
# Session persists after refresh
# API calls work without manual token
# Logout clears session
```

---

## 🔄 Rollback Strategy

**If Phase 3 fails:**

Frontend can switch between NextAuth and Flask JWT:
```typescript
const USE_NEXTAUTH = process.env.NEXT_PUBLIC_USE_NEXTAUTH === 'true';

if (USE_NEXTAUTH) {
  // Use NextAuth
  const session = await getSession();
} else {
  // Use Flask JWT
  const token = localStorage.getItem('token');
}
```

---

## 📊 Complexity

| Component | Complexity | Hours |
|-----------|------------|-------|
| NextAuth Setup | 🟢 Easy | 2-3 |
| Telegram Provider | 🟡 Medium | 4-5 |
| Permissions | 🟡 Medium | 3-4 |
| Guest Login | 🟢 Easy | 2-3 |
| Session Management | 🟢 Easy | 2-3 |
| Frontend Integration | 🟡 Medium | 2-3 |
| **TOTAL** | | **15-21 hours** |

---

## 🎓 Learning Resources

- [NextAuth.js Docs](https://next-auth.js.org/)
- [Custom Providers](https://next-auth.js.org/configuration/providers/credentials)
- [Telegram Login Widget](https://core.telegram.org/widgets/login)
- [JWT Strategy](https://next-auth.js.org/configuration/options#jwt)

---

**Next**: [Phase 4: Telegram Microservice](../phase-4-telegram-service/README.md)

**Created**: 2025-11-22
**Status**: 📝 Planned

# 📋 Task 1.2: PostgreSQL Setup

**מזהה**: TASK-1.2
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 1-2 hours

---

## 🎯 Goal

לבחור ולהקים PostgreSQL database לפרויקט, ולקבל DATABASE_URL עובד.

### Why This Task?
- PostgreSQL הוא production-ready database (לא כמו SQLite)
- נדרש עבור Prisma migrations
- תומך ב-concurrent connections
- אין "database locked" errors

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- None (ניתן לרוץ במקביל ל-1.1)

**External dependencies:**
- [ ] החלטה: Vercel Postgres / Supabase / Local PostgreSQL

---

## 📋 Implementation Guide

### Step 1: Choose PostgreSQL Provider

**אפשרויות:**

#### Option A: Vercel Postgres ⭐ **RECOMMENDED**
**יתרונות:**
- ✅ אינטגרציה מושלמת עם Vercel
- ✅ Free tier: 256MB storage, 60 hours compute/month
- ✅ Setup אוטומטי דרך Vercel Dashboard
- ✅ Automatically sets DATABASE_URL env var
- ✅ Connection pooling built-in

**חסרונות:**
- ⚠️ Tied to Vercel ecosystem
- ⚠️ Free tier limits (אבל מספיק לפרויקט הזה)

**When to choose**: אם deploying על Vercel (מומלץ!)

---

#### Option B: Supabase
**יתרונות:**
- ✅ Free tier: 500MB storage, unlimited API requests
- ✅ Includes Auth, Storage, Realtime (bonus features)
- ✅ Great dashboard
- ✅ No sleep issues

**חסרונות:**
- ⚠️ יותר features ממה שצריך
- ⚠️ Connection pooling requires setup

**When to choose**: אם רוצים flexibility או bonus features

---

#### Option C: Local PostgreSQL (Development Only)
**יתרונות:**
- ✅ Full control
- ✅ No internet required
- ✅ Fast for dev

**חסרונות:**
- ❌ לא לproduction
- ❌ צריך להתקין PostgreSQL locally
- ❌ Manual setup

**When to choose**: רק לפיתוח מקומי

---

### Step 2: Setup Chosen Provider

#### If Vercel Postgres:
**מה לעשות:**
- [ ] לך ל-Vercel Dashboard
- [ ] בחר את הפרויקט
- [ ] Storage → Create Database → Postgres
- [ ] העתק את DATABASE_URL

**Detailed Steps:**
```bash
1. Go to: https://vercel.com/dashboard
2. Select project: ourRecipesWeb (or your project name)
3. Navigate to: Storage tab
4. Click: Create Database
5. Select: Postgres
6. Choose: Region (closest to users)
7. Click: Create

# Vercel will automatically:
- Provision PostgreSQL database
- Set DATABASE_URL in environment variables
- Enable connection pooling
```

**קבלת CONNECTION STRING:**
```bash
# In Vercel Dashboard:
Storage → [your-db] → .env.local tab

# Copy:
DATABASE_URL="postgres://default:..."
```

---

#### If Supabase:
**מה לעשות:**
- [ ] צור חשבון ב-supabase.com
- [ ] צור project חדש
- [ ] קבל connection string

**Detailed Steps:**
```bash
1. Go to: https://supabase.com
2. Sign up / Sign in
3. Create new project:
   - Name: our-recipes-db
   - Database Password: [strong password]
   - Region: [closest to users]
4. Wait for provisioning (~2 minutes)

# Get connection string:
Settings → Database → Connection string → URI

# Format:
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

**⚠️ Important:**
- Use **Transaction mode** connection string (port 5432)
- NOT Session mode (port 6543)
- Enable connection pooling

---

#### If Local PostgreSQL:
**מה לעשות:**
- [ ] התקן PostgreSQL locally
- [ ] צור database
- [ ] הגדר user וpassword

**Installation:**

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
- Download from: https://www.postgresql.org/download/windows/
- Run installer
- Note the password you set for `postgres` user

**Create Database:**
```bash
# Connect as postgres user
psql -U postgres

# In psql:
CREATE DATABASE our_recipes_dev;
CREATE USER our_recipes_user WITH PASSWORD 'dev_password';
GRANT ALL PRIVILEGES ON DATABASE our_recipes_dev TO our_recipes_user;
\q
```

**Connection String:**
```
DATABASE_URL="postgresql://our_recipes_user:dev_password@localhost:5432/our_recipes_dev"
```

---

### Step 3: Update .env.local

**מה לעשות:**
- [ ] פתח `frontend/ourRecipesFront/.env.local`
- [ ] הוסף את DATABASE_URL האמיתי
- [ ] בדוק שהחיבור עובד

**קובץ לעדכן:** `frontend/ourRecipesFront/.env.local`

**תוכן:**
```env
# Database Connection
DATABASE_URL="postgresql://..."

# Example Vercel Postgres:
# DATABASE_URL="postgres://default:abc123@ep-cool-name-123456.us-east-1.postgres.vercel-storage.com/verceldb"

# Example Supabase:
# DATABASE_URL="postgresql://postgres.abcdefghijk:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# Example Local:
# DATABASE_URL="postgresql://our_recipes_user:dev_password@localhost:5432/our_recipes_dev"
```

**⚠️ Security:**
- אל תשתף את ה-DATABASE_URL!
- וודא ש-`.env.local` ב-`.gitignore`
- לא להעלות ל-GitHub!

---

### Step 4: Test Connection

**מה לעשות:**
- [ ] בדוק שPrisma יכול להתחבר ל-DB
- [ ] הרץ `prisma db push` לבדיקה (אם יש schema)

**Commands:**
```bash
cd frontend/ourRecipesFront

# Test connection
npx prisma db push --preview-feature

# Or just validate
npx prisma validate
```

**Expected output (אם schema ריק):**
```
✔ Datasource "db": PostgreSQL database "..." at "..."
```

**Expected output (אם יש schema):**
```
✔ Generated Prisma Client
✔ The database is now in sync with the Prisma schema
```

**אם יש שגיאה:**
```
Error: P1001: Can't reach database server at `...`
```
→ בדוק את DATABASE_URL, firewall rules, וכו'

---

### Step 5: Configure Connection Pooling (Production)

**למה Connection Pooling?**
- Serverless functions יוצרים connections רבים
- PostgreSQL מוגבל ב-connections (Vercel: 20, Supabase: 60)
- Pooling ממחזר connections

**If Vercel Postgres:**
✅ Built-in! לא צריך לעשות כלום.

**If Supabase:**
```env
# Use pooled connection string (port 5432)
DATABASE_URL="postgresql://postgres.[ref]:[pwd]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Add to .env.local:
DATABASE_URL="..."
DIRECT_URL="postgresql://postgres.[ref]:[pwd]@aws-0-[region].supabase.com:5432/postgres"
```

**Update Prisma schema:**
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // For migrations
}
```

**If Local:**
לא צריך pooling בdev.

---

### Step 6: Update Environment Variables Checklist

**מה לעשות:**
- [ ] `.env.local` - local development
- [ ] Vercel Dashboard - production
- [ ] `.env.example` - documentation

**Files to update:**

**`.env.local`** (local dev):
```env
DATABASE_URL="postgresql://..."
```

**`.env.example`** (for documentation):
```env
# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
# Get from: Vercel Dashboard or Supabase Settings
```

**Vercel Dashboard** (production):
```
Settings → Environment Variables → Add
Name: DATABASE_URL
Value: postgres://...
Environments: Production, Preview, Development
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] PostgreSQL database provisioned and running
- [x] DATABASE_URL available and correct
- [x] Connection working (tested with prisma)
- [x] Environment variables set up correctly

### Technical Requirements:
- [x] `npx prisma db push` (or validate) succeeds
- [x] No connection errors
- [x] Connection pooling configured (if production)
- [x] `.env.local` has DATABASE_URL
- [x] `.env.local` in `.gitignore`

### Production Readiness:
- [x] Free tier limits understood
- [x] Backup strategy noted (automatic for Vercel/Supabase)
- [x] Connection limits known

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: Connection Test**
```bash
npx prisma validate
# Expected: ✔ Datasource "db": PostgreSQL database
```

**Test 2: Can Push Schema** (if schema exists)
```bash
npx prisma db push
# Expected: ✔ The database is now in sync
```

**Test 3: Prisma Studio**
```bash
npm run prisma:studio
# Opens at http://localhost:5555
# Should show empty database (no tables yet)
```

**Expected:**
- Prisma Studio opens
- Shows PostgreSQL connection
- No errors

**Test 4: Connection String Format**
```bash
# Check format
echo $DATABASE_URL | grep "postgresql://"
# Should output the connection string
```

---

## 🔄 Rollback Strategy

**אם משהו משתבש:**

### If Vercel Postgres:
```bash
# In Vercel Dashboard:
Storage → [db-name] → Settings → Delete Database
# Can recreate anytime, data will be lost
```

### If Supabase:
```bash
# In Supabase Dashboard:
Settings → General → Delete Project
# Or just remove DATABASE_URL from .env.local
```

### If Local:
```bash
# Drop database
psql -U postgres
DROP DATABASE our_recipes_dev;
\q
```

**Cleanup `.env.local`:**
```bash
# Remove or comment out DATABASE_URL
# DATABASE_URL="..."
```

**Zero risk**: בשלב זה אין data בDB, רק setup.

---

## 📊 Estimated Time

- **Minimum**: 30 minutes (Vercel Postgres - אוטומטי)
- **Expected**: 1 hour
- **Maximum**: 2 hours (אם יש connection issues)

**Breakdown:**
- Choose provider: 10 min
- Setup database: 20 min (Vercel) / 30 min (Supabase) / 45 min (Local)
- Test connection: 10 min
- Configure env vars: 10 min
- Documentation: 10 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Free Tier Limits:**

**Vercel Postgres:**
- Storage: 256 MB
- Compute: 60 hours/month
- Connections: 20
- → מספיק לפרויקט הזה!

**Supabase:**
- Storage: 500 MB
- Bandwidth: 2 GB/month
- Connections: 60 (pooled)
- → גם מספיק!

**2. Connection Pooling:**
- Serverless functions → many connections
- Without pooling: will hit limits fast
- **Solution**: Use pooled connection string

**3. Security:**
- **NEVER** commit DATABASE_URL to git
- **ALWAYS** use `.env.local` (gitignored)
- **ROTATE** passwords if exposed

**4. Migration Strategy:**
- Development: `npx prisma db push` (fast, no migrations)
- Production: `npx prisma migrate deploy` (tracked migrations)

### Potential Issues:

**Issue 1**: "Can't reach database server"
- **Causes**: Wrong URL, firewall, VPN
- **Solutions**:
  - Check URL format
  - Test from different network
  - Check firewall rules (Supabase)
  - Allow IP in database settings

**Issue 2**: "Too many connections"
- **Cause**: No connection pooling
- **Solution**: Use pooled connection string

**Issue 3**: SSL errors
- **Cause**: PostgreSQL requires SSL
- **Solution**: Add `?sslmode=require` to URL
  ```
  DATABASE_URL="postgresql://...?sslmode=require"
  ```

**Issue 4**: Vercel can't connect
- **Cause**: DATABASE_URL not in Vercel env vars
- **Solution**: Add in Vercel Dashboard → Settings → Environment Variables

### References:
- [Vercel Postgres Docs](https://vercel.com/docs/storage/vercel-postgres)
- [Supabase Database Docs](https://supabase.com/docs/guides/database)
- [Prisma Connection Management](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
- [PostgreSQL Connection Pooling](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#serverless-environments-faas)

---

## 🔗 Related Tasks

**Can run in parallel with:**
- TASK-1.1: Prisma Setup (independent)
- TASK-1.5: API Routes Structure (independent)
- TASK-1.7: Testing Infrastructure (independent)
- TASK-1.8: Logging Setup (independent)

**Blocks:**
- TASK-1.3: Prisma Schema Creation (needs working DB)
- TASK-1.4: Migration Script (needs target DB)

---

## ✏️ AI Agent Instructions

**For Claude Code or similar AI agents:**

```
Task: Setup PostgreSQL database for the project

Context:
- Currently using SQLite (not suitable for production)
- Migrating to PostgreSQL with Prisma
- Need production-ready database
- Options: Vercel Postgres, Supabase, or Local

Your job:
1. Help user choose provider (recommend Vercel Postgres if on Vercel)
2. Guide through database provisioning
3. Obtain DATABASE_URL connection string
4. Update .env.local with DATABASE_URL
5. Verify connection with `npx prisma validate`
6. Configure connection pooling if needed
7. Document the setup in .env.example

Constraints:
- Do NOT commit DATABASE_URL to git
- Ensure .env.local is gitignored
- Use pooled connection string for production
- Test connection before proceeding

Decision tree:
- If deploying to Vercel → Use Vercel Postgres
- If need flexibility → Use Supabase
- If local dev only → Use Local PostgreSQL

Expected output:
- DATABASE_URL in .env.local (working)
- Connection verified (npx prisma validate passes)
- Documentation updated
- Success message: "PostgreSQL connection established"

Verification:
1. Run: npx prisma validate
   Expected: ✔ Datasource "db": PostgreSQL database
2. Run: npx prisma db push (if schema exists)
   Expected: ✔ Database is now in sync
3. Optional: npm run prisma:studio
   Expected: Opens GUI showing empty PostgreSQL db
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

# 📋 Task 1.1: Prisma Setup

**מזהה**: TASK-1.1
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 2-3 hours

---

## 🎯 Goal

להתקין ולהגדיר את Prisma ORM בפרויקט Next.js כתשתית לגישה ל-database.

### Why This Task?
- Prisma יהיה ה-ORM העיקרי במקום SQLAlchemy
- Type-safe database access
- נקודת התחלה לכל שלב 1

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- None (זו משימת הפתיחה של שלב 1)

**External dependencies:**
- [x] Node.js 18+ installed
- [x] npm או yarn
- [x] גישה לתיקיית `frontend/ourRecipesFront`

---

## 📋 Implementation Guide

### Step 1: Install Prisma Packages
**מה לעשות:**
- [ ] נווט לתיקיית frontend
- [ ] התקן prisma CLI ו-client
- [ ] אתחל prisma project

**Commands:**
```bash
cd frontend/ourRecipesFront
npm install prisma @prisma/client --save
npm install -D tsx  # For TypeScript script execution
npx prisma init
```

**Expected Output:**
```
✔ Your Prisma schema was created at prisma/schema.prisma
  You can now open it in your favorite editor.
```

**קבצים שנוצרו:**
- `prisma/schema.prisma` - הקובץ הראשי
- `.env` או `.env.local` - עם DATABASE_URL placeholder

---

### Step 2: Configure Prisma for PostgreSQL
**מה לעשות:**
- [ ] פתח את `prisma/schema.prisma`
- [ ] שנה את ה-provider ל-postgresql
- [ ] הגדר logging level

**קובץ לעדכן:** `prisma/schema.prisma`

**הנחיות:**
- Provider צריך להיות `"postgresql"` (לא sqlite)
- הוסף `previewFeatures` אם צריך (לא חובה בשלב זה)
- הגדר `log` levels לפי environment

**דוגמה למבנה הרצוי:**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**⚠️ Important:**
- אל תשים DATABASE_URL בקובץ! רק ב-`.env.local`
- `.env.local` צריך להיות ב-`.gitignore`

---

### Step 3: Create Prisma Client Singleton
**מה לעשות:**
- [ ] צור תיקייה `src/lib` אם לא קיימת
- [ ] צור קובץ `src/lib/prisma.ts`
- [ ] הגדר singleton pattern

**קובץ ליצור:** `src/lib/prisma.ts`

**הנחיות:**
- Next.js Hot Reload יוצר instances רבים
- Singleton מבטיח instance אחד בלבד
- Development: יותר logging, Production: פחות logging

**מבנה הקובץ צריך לכלול:**
1. Import של PrismaClient
2. Global variable declaration (TypeScript safe)
3. Singleton instance creation
4. Conditional logging based on NODE_ENV
5. Export of prisma instance

**⚠️ Critical:**
- חייב להיות singleton! אחרת תהיה connection pool exhaustion
- בdevelopment, שמור instance ב-global כדי למנוע hot reload duplicates

---

### Step 4: Add Scripts to package.json
**מה לעשות:**
- [ ] הוסף Prisma scripts ל-package.json
- [ ] וודא שיש scripts ל-generation, migration, studio

**קובץ לעדכן:** `frontend/ourRecipesFront/package.json`

**Scripts להוסיף:**
```json
{
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:studio": "prisma studio",
    "prisma:push": "prisma db push",
    "prisma:migrate": "prisma migrate dev"
  }
}
```

**הנחיות:**
- `prisma:generate` - יריץ אחרי כל שינוי בschema
- `prisma:studio` - GUI לבדיקת data
- `prisma:push` - לפיתוח מהיר (לא ייצור migrations)
- `prisma:migrate` - לproduction (יוצר migration files)

---

### Step 5: Setup .env.local Template
**מה לעשות:**
- [ ] צור `.env.local` (אם לא קיים)
- [ ] הוסף DATABASE_URL placeholder
- [ ] צור `.env.example` לdocumentation

**קובץ ליצור:** `frontend/ourRecipesFront/.env.local`

**תוכן:**
```env
# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"

# Example for local dev:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/our_recipes_dev"

# Or Vercel Postgres (will be filled later):
# DATABASE_URL="postgres://..."
```

**קובץ ליצור:** `frontend/ourRecipesFront/.env.example`

**תוכן:**
```env
# Database Connection
DATABASE_URL="postgresql://..."

# Add other env vars here as template
```

**⚠️ Important:**
- `.env.local` צריך להיות ב-`.gitignore`!
- `.env.example` כן נכנס ל-git (בלי ערכים אמיתיים)

---

### Step 6: Verify Installation
**מה לעשות:**
- [ ] בדוק ש-Prisma CLI עובד
- [ ] וודא שהמבנה תקין

**Commands:**
```bash
npx prisma --version
# Should output: prisma : X.X.X

npx prisma validate
# Should output: No schema errors detected
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] Prisma CLI מותקן ועובד
- [x] `prisma/schema.prisma` קיים ומוגדר ל-PostgreSQL
- [x] `src/lib/prisma.ts` קיים ומכיל singleton
- [x] Scripts ב-package.json
- [x] `.env.local` קיים עם DATABASE_URL placeholder

### Technical Requirements:
- [x] `npx prisma validate` עובר ללא שגיאות
- [x] TypeScript לא מתלונן על imports
- [x] `.gitignore` כולל `.env.local`

### File Structure:
```
frontend/ourRecipesFront/
├── prisma/
│   └── schema.prisma          ✅ Created
├── src/
│   └── lib/
│       └── prisma.ts          ✅ Created
├── .env.local                 ✅ Created (gitignored)
├── .env.example               ✅ Created
└── package.json               ✅ Updated
```

---

## 🧪 Testing Instructions

### Manual Testing:
```bash
# 1. Verify Prisma is installed
npx prisma --version

# 2. Validate schema
npx prisma validate

# 3. Try to import prisma client (should not error)
cat > test-import.ts << EOF
import { prisma } from './src/lib/prisma';
console.log('Prisma imported successfully');
EOF

npx tsx test-import.ts
rm test-import.ts
```

**Expected result:**
- All commands succeed
- No TypeScript errors

### Automated Testing:
לא רלוונטי בשלב זה (רק setup)

---

## 🔄 Rollback Strategy

**אם משהו משתבש:**

1. **Uninstall packages:**
   ```bash
   npm uninstall prisma @prisma/client tsx
   ```

2. **Remove files:**
   ```bash
   rm -rf prisma/
   rm src/lib/prisma.ts
   rm .env.local
   ```

3. **Restore package.json** (git):
   ```bash
   git checkout package.json package-lock.json
   ```

**Zero risk**: אין חיבור ל-DB בשלב זה, רק התקנה.

---

## 📊 Estimated Time

- **Minimum**: 1 hour (אם הכל חלק)
- **Expected**: 2 hours
- **Maximum**: 3 hours (אם יש בעיות עם packages)

---

## 📝 Implementation Notes

### Important Considerations:
- **Singleton Pattern חובה!** Next.js Hot Reload יוצר duplicates
- `.env.local` מועדף על `.env` ב-Next.js
- DATABASE_URL יהיה ריק עד Task 1.2

### Potential Issues:

**Issue 1**: npm install fails
- **Solution**: נסה `npm cache clean --force` ואז install שוב

**Issue 2**: TypeScript error on import
- **Solution**: הרץ `npx prisma generate` (אפילו בלי schema עדיין)

**Issue 3**: Next.js לא מזהה את prisma
- **Solution**: Restart Next.js dev server

### References:
- [Prisma Quickstart](https://www.prisma.io/docs/getting-started/quickstart)
- [Prisma with Next.js](https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices)
- [Best practices for instantiating PrismaClient](https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices#solution)

---

## 🔗 Related Tasks

**Blocks** (משימות שתלויות במשימה זו):
- TASK-1.3: Prisma Schema Creation (צריך prisma מותקן)
- TASK-1.6: Types Setup (צריך prisma client)

**Can run in parallel:**
- TASK-1.2: PostgreSQL Setup (עצמאי)
- TASK-1.5: API Routes Structure (עצמאי)
- TASK-1.7: Testing Infrastructure (עצמאי)
- TASK-1.8: Logging Setup (עצמאי)

---

## ✏️ AI Agent Instructions

**For Claude Code or similar AI agents:**

```
Task: Install and configure Prisma ORM in Next.js project

Context:
- Project location: frontend/ourRecipesFront
- Currently uses Flask + SQLAlchemy for backend
- Migrating to Next.js + Prisma
- This is the first task in Phase 1

Your job:
1. Install prisma, @prisma/client, tsx packages
2. Run `npx prisma init`
3. Configure datasource for PostgreSQL in schema.prisma
4. Create singleton Prisma client at src/lib/prisma.ts
5. Add prisma scripts to package.json
6. Create .env.local with DATABASE_URL placeholder
7. Create .env.example as template
8. Verify installation with `npx prisma validate`

Constraints:
- Do NOT connect to a database yet (that's Task 1.2)
- Do NOT create any models in schema.prisma yet (that's Task 1.3)
- Ensure .env.local is gitignored
- Use singleton pattern for Prisma client (Next.js best practice)

Expected output:
- prisma/ directory with schema.prisma
- src/lib/prisma.ts with singleton client
- Updated package.json with scripts
- .env.local and .env.example created
- Success message: "Prisma setup complete"

Verification:
Run: npx prisma validate
Expected: "No schema errors detected"
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

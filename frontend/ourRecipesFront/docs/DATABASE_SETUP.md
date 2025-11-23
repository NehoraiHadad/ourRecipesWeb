# 🗄️ Database Setup Guide

## Overview

המערכת משתמשת ב-**PostgreSQL** עם **Prisma ORM**.

**אין צורך ב-migration מ-SQLite** - המערכת משתמשת במנגנון sync מטלגרם לאכלוס ה-DB.

---

## 🚀 Quick Start

### Option 1: Vercel Postgres (מומלץ לפרודקשן)

1. **Create database:**
   ```bash
   # בטרמינל Vercel
   vercel postgres create
   ```

2. **קבל את ה-connection string:**
   ```bash
   vercel env pull .env.local
   ```

3. **Prisma setup:**
   ```bash
   npm run prisma:push    # Create tables
   npm run prisma:studio  # Open GUI
   ```

4. **Sync data from Telegram:**
   - בסיום Phase 4 תהיה endpoint ל-sync
   - או הפעל את הsync הקיים מהפלאסק

**עלות:** Free tier: 256 MB, 60 שעות compute/חודש

---

### Option 2: Supabase (מומלץ לפיתוח)

1. **Create project:**
   - לך ל-[Supabase Dashboard](https://supabase.com/dashboard)
   - Create new project

2. **קבל connection string:**
   ```
   Settings → Database → Connection string (URI)
   ```

3. **הוסף ל-.env.local:**
   ```env
   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
   ```

4. **Prisma setup:**
   ```bash
   npm run prisma:push
   ```

**עלות:** Free tier: 500 MB, 2 GB transfer/חודש

---

### Option 3: Local PostgreSQL (לפיתוח)

#### Docker (קל):
```bash
docker run --name recipes-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=our_recipes_dev \
  -p 5432:5432 \
  -d postgres:16-alpine
```

#### או התקנה רגילה:
```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo apt install postgresql-16
sudo systemctl start postgresql
```

**Connection string:**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/our_recipes_dev"
```

---

## 📋 Setup Steps

### 1. Update .env.local

```bash
cp .env.example .env.local
```

ערוך `.env.local`:
```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
LOG_LEVEL=debug
```

### 2. Push Schema to Database

```bash
npm run prisma:push
```

זה יוצר את כל הטבלאות ב-PostgreSQL.

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

### 4. Verify Connection

```bash
npm run prisma:studio
```

אמור לפתוח GUI ב-http://localhost:5555

---

## 🔄 Data Population Strategy

**לא צריך migration script מ-SQLite!**

### Sync from Telegram

המערכת כוללת מנגנון sync מטלגרם שאוכלס את ה-DB:

1. **Phase 4 - לאחר יצירת Telegram Service:**
   ```bash
   # API endpoint שייווצר
   POST /api/sync/full
   ```

2. **כרגע - דרך Flask הקיים:**
   ```bash
   # אם Flask רץ
   curl -X POST http://localhost:5000/api/sync/full
   ```

3. **Manual - דרך Prisma Studio:**
   - פתח Prisma Studio
   - הוסף רשומות ידנית לבדיקה

---

## 🧪 Testing Database Connection

### בדיקה מהירה:

```typescript
// test-db-connection.ts
import { prisma } from './src/lib/prisma';

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    const count = await prisma.recipe.count();
    console.log(`📊 Recipes in DB: ${count}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
}

testConnection();
```

```bash
npx tsx test-db-connection.ts
```

---

## 📊 Database Schema

ה-schema מוגדר ב-`prisma/schema.prisma` וכולל:

### Models (10):
- **Recipe** - מתכונים
- **RecipeVersion** - גרסאות מתכון
- **UserRecipe** - קשר משתמש-מתכון
- **Menu** - תפריטים
- **MenuMeal** - ארוחות בתפריט
- **MealRecipe** - מתכונים בארוחה
- **ShoppingListItem** - רשימת קניות
- **Place** - המלצות מקומות
- **SyncLog** - לוגים של sync
- **SyncQueue** - תור sync

### Enums (7):
- RecipeStatus, RecipeDifficulty, DietaryType, SyncStatus, QueueStatus, QueueActionType, CourseType

---

## 🔧 Common Commands

```bash
# יצירת טבלאות (dev)
npm run prisma:push

# יצירת migration (production)
npm run prisma:migrate

# פתיחת GUI
npm run prisma:studio

# יצירת Prisma Client מחדש
npm run prisma:generate

# Reset DB (מחיקה ויצירה מחדש)
npx prisma migrate reset
```

---

## ⚠️ Important Notes

1. **אל תשתמש ב-SQLite בפרודקשן** - רק PostgreSQL
2. **Connection pooling** - Prisma מטפל בזה אוטומטית
3. **Migrations** - ב-production השתמש ב-`prisma migrate`, לא `prisma push`
4. **Backup** - תמיד עשה backup לפני schema changes

---

## 🔐 Security

- ✅ השתמש ב-environment variables ל-DATABASE_URL
- ✅ אל תשמור passwords ב-git
- ✅ השתמש ב-SSL connection בפרודקשן
- ✅ הגבל גישה ל-database לIP ספציפיים

---

## 🆘 Troubleshooting

### "Can't reach database server"
```bash
# בדוק ש-DATABASE_URL נכון
echo $DATABASE_URL

# בדוק ש-DB רץ
pg_isready -h localhost -p 5432
```

### "SSL connection required"
הוסף ל-DATABASE_URL:
```
?sslmode=require
```

### "Too many connections"
הגדר connection limit:
```typescript
// src/lib/prisma.ts
new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Connection pooling
  pool: {
    max: 10,
    min: 2,
  },
});
```

---

**Created**: 2025-11-23
**Last Updated**: 2025-11-23

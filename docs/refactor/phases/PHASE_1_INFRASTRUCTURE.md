# 🏗️ Phase 1: Infrastructure Setup

**Timeline**: שבוע 1-2
**Status**: 📝 Planned

---

## 🎯 מטרות שלב זה

להקים את כל התשתיות הדרושות למעבר:
1. ✅ Prisma ORM + PostgreSQL
2. ✅ Next.js API Routes structure
3. ✅ Types משותפים (Frontend ↔ Backend)
4. ✅ Testing infrastructure
5. ✅ Database migration (SQLite → PostgreSQL)
6. ✅ Error handling framework
7. ✅ Logging infrastructure

**קריטריון הצלחה**:
- יכולים לקרוא/לכתוב ל-DB דרך Prisma ב-Next.js API route
- יכולים להריץ test ולקבל תוצאה
- Database מוכן ומאוכלס בdata

---

## 📋 משימות מפורטות

### 1.1 Setup Prisma ORM

#### 1.1.1 התקנה
```bash
cd frontend/ourRecipesFront
npm install prisma @prisma/client
npm install -D tsx  # For running TypeScript scripts
npx prisma init
```

**Expected Output**:
```
✔ Your Prisma schema was created at prisma/schema.prisma
  You can now open it in your favorite editor.

Next steps:
1. Set the DATABASE_URL in the .env file
2. Set the provider in your schema.prisma file
3. Run prisma db push
```

#### 1.1.2 יצירת Prisma Schema
**קובץ**: `frontend/ourRecipesFront/prisma/schema.prisma`

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ========================================
// ENUMS
// ========================================

enum RecipeDifficulty {
  EASY
  MEDIUM
  HARD
}

enum DietaryType {
  MEAT
  DAIRY
  PAREVE
}

// ========================================
// MODELS
// ========================================

model Recipe {
  id                Int              @id @default(autoincrement())
  telegram_id       Int              @unique
  title             String           @db.VarChar(500)
  raw_content       String           @db.Text
  ingredients       String?          @db.Text  // || separated
  instructions      String?          @db.Text
  categories        String?          @db.Text  // comma-separated
  recipe_metadata   Json?
  image_data        Bytes?
  image_url         String?          @db.VarChar(500)
  media_type        String?          @db.VarChar(50)
  created_at        DateTime         @default(now())
  updated_at        DateTime         @updatedAt
  last_sync         DateTime?
  is_parsed         Boolean          @default(false)
  parse_errors      String?
  status            String           @default("active") @db.VarChar(20)
  ingredients_list  Json?
  cooking_time      Int?
  difficulty        RecipeDifficulty?
  servings          Int?
  preparation_time  Int?
  formatted_content Json?
  is_verified       Boolean          @default(false)
  sync_status       String           @default("synced") @db.VarChar(20)
  sync_error        String?          @db.Text

  // Relations
  user_recipes      UserRecipe[]
  versions          RecipeVersion[]
  meal_recipes      MealRecipe[]

  @@index([telegram_id])
  @@map("recipes")
}

model Menu {
  id                   Int                @id @default(autoincrement())
  user_id              String             @db.VarChar(50)
  telegram_message_id  Int?               @unique
  last_sync            DateTime?
  name                 String             @db.VarChar(200)
  event_type           String?            @db.VarChar(100)
  description          String?            @db.Text
  total_servings       Int                @default(4)
  dietary_type         DietaryType?
  share_token          String             @unique @db.VarChar(32)
  is_public            Boolean            @default(false)
  ai_reasoning         String?            @db.Text
  generation_prompt    String?            @db.Text
  created_at           DateTime           @default(now())
  updated_at           DateTime           @updatedAt

  // Relations
  meals                MenuMeal[]
  shopping_list_items  ShoppingListItem[]

  @@index([user_id])
  @@index([telegram_message_id])
  @@index([share_token])
  @@map("menus")
}

model MenuMeal {
  id         Int          @id @default(autoincrement())
  menu_id    Int
  meal_type  String       @db.VarChar(100)
  meal_order Int
  meal_time  String?      @db.VarChar(50)
  notes      String?      @db.Text
  created_at DateTime     @default(now())

  // Relations
  menu       Menu         @relation(fields: [menu_id], references: [id], onDelete: Cascade)
  recipes    MealRecipe[]

  @@index([menu_id, meal_order])
  @@map("menu_meals")
}

model MealRecipe {
  id            Int       @id @default(autoincrement())
  menu_meal_id  Int
  recipe_id     Int
  course_type   String?   @db.VarChar(100)
  course_order  Int       @default(0)
  servings      Int?
  notes         String?   @db.Text
  ai_reason     String?   @db.Text
  created_at    DateTime  @default(now())

  // Relations
  meal          MenuMeal  @relation(fields: [menu_meal_id], references: [id], onDelete: Cascade)
  recipe        Recipe    @relation(fields: [recipe_id], references: [id], onDelete: Cascade)

  @@index([menu_meal_id, recipe_id])
  @@map("meal_recipes")
}

model Place {
  id                  Int       @id @default(autoincrement())
  name                String    @db.VarChar(255)
  website             String?   @db.VarChar(255)
  description         String?   @db.Text
  location            String?   @db.VarChar(255)
  waze_link           String?   @db.VarChar(255)
  type                String?   @db.VarChar(50)
  created_by          String    @db.VarChar(255)
  created_at          DateTime  @default(now())
  telegram_message_id Int?
  is_synced           Boolean   @default(false)
  last_sync           DateTime?
  is_deleted          Boolean   @default(false)

  @@map("places")
}

model ShoppingListItem {
  id              Int      @id @default(autoincrement())
  menu_id         Int
  ingredient_name String   @db.VarChar(200)
  quantity        String?  @db.VarChar(100)
  category        String?  @db.VarChar(100)
  is_checked      Boolean  @default(false)
  notes           String?  @db.Text
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  // Relations
  menu            Menu     @relation(fields: [menu_id], references: [id], onDelete: Cascade)

  @@index([menu_id, category])
  @@map("shopping_list_items")
}

model RecipeVersion {
  id                  Int       @id @default(autoincrement())
  recipe_id           Int
  version_num         Int
  content             Json
  created_at          DateTime  @default(now())
  created_by          String?   @db.VarChar(100)
  change_description  String?   @db.Text
  is_current          Boolean   @default(false)
  image_data          Bytes?

  // Relations
  recipe              Recipe    @relation(fields: [recipe_id], references: [id], onDelete: Cascade)

  @@map("recipe_versions")
}

model UserRecipe {
  id          Int      @id @default(autoincrement())
  user_id     String   @db.VarChar(50)
  recipe_id   Int
  created_at  DateTime @default(now())
  is_favorite Boolean  @default(false)

  // Relations
  recipe      Recipe   @relation(fields: [recipe_id], references: [id], onDelete: Cascade)

  @@index([user_id, recipe_id])
  @@map("user_recipes")
}

model SyncLog {
  id                 Int       @id @default(autoincrement())
  started_at         DateTime  @default(now())
  completed_at       DateTime?
  status             String    @db.VarChar(20)
  details            String?   @db.Text
  error_message      String?   @db.Text
  sync_type          String?   @db.VarChar(50)
  recipes_processed  Int       @default(0)
  recipes_failed     Int       @default(0)
  recipes_added      Int       @default(0)
  recipes_updated    Int       @default(0)
  places_processed   Int       @default(0)
  places_failed      Int       @default(0)
  menus_processed    Int       @default(0)
  menus_failed       Int       @default(0)
  menus_added        Int       @default(0)
  menus_updated      Int       @default(0)

  @@map("sync_log")
}
```

#### 1.1.3 Setup Prisma Client Singleton
**קובץ**: `frontend/ourRecipesFront/src/lib/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

**למה Singleton?**
- Next.js Hot Reload יוצר הרבה instances
- Singleton מבטיח instance אחד
- חוסך connections ל-DB

---

### 1.2 Setup PostgreSQL Database

#### Option A: Vercel Postgres (Recommended)
```bash
# בפרויקט Vercel
vercel env add DATABASE_URL
# הזן: postgresql://...

# Local development
vercel env pull .env.local
```

**יתרונות**:
- ✅ Integration מושלם עם Vercel
- ✅ Free tier: 256MB storage, 60 hours compute
- ✅ Auto-scaling
- ✅ Zero config

#### Option B: Supabase
```bash
# Create project on supabase.com
# Copy DATABASE_URL

# .env.local
DATABASE_URL="postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres"
```

**יתרונות**:
- ✅ Free tier: 500MB storage
- ✅ Dashboard מעולה
- ✅ Real-time features (bonus)

#### Option C: Local PostgreSQL (Dev Only)
```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb our_recipes_dev

# .env.local
DATABASE_URL="postgresql://localhost:5432/our_recipes_dev"
```

---

### 1.3 Database Migration Script

#### 1.3.1 Export from SQLite
**קובץ**: `scripts/export-sqlite-data.ts`

```typescript
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';

async function exportData() {
  // Open SQLite database
  const db = await open({
    filename: '../backend/ourRecipesBack/recipes.db',
    driver: sqlite3.Database
  });

  console.log('📊 Exporting data from SQLite...');

  // Export recipes
  const recipes = await db.all('SELECT * FROM recipes');
  await fs.writeFile(
    './migration-data/recipes.json',
    JSON.stringify(recipes, null, 2)
  );
  console.log(`✅ Exported ${recipes.length} recipes`);

  // Export menus
  const menus = await db.all('SELECT * FROM menus');
  await fs.writeFile(
    './migration-data/menus.json',
    JSON.stringify(menus, null, 2)
  );
  console.log(`✅ Exported ${menus.length} menus`);

  // Export menu_meals
  const menuMeals = await db.all('SELECT * FROM menu_meals');
  await fs.writeFile(
    './migration-data/menu_meals.json',
    JSON.stringify(menuMeals, null, 2)
  );

  // Export meal_recipes
  const mealRecipes = await db.all('SELECT * FROM meal_recipes');
  await fs.writeFile(
    './migration-data/meal_recipes.json',
    JSON.stringify(mealRecipes, null, 2)
  );

  // Export places
  const places = await db.all('SELECT * FROM places');
  await fs.writeFile(
    './migration-data/places.json',
    JSON.stringify(places, null, 2)
  );

  // Export shopping_list_items
  const shoppingItems = await db.all('SELECT * FROM shopping_list_items');
  await fs.writeFile(
    './migration-data/shopping_list_items.json',
    JSON.stringify(shoppingItems, null, 2)
  );

  // Export user_recipes
  const userRecipes = await db.all('SELECT * FROM user_recipes');
  await fs.writeFile(
    './migration-data/user_recipes.json',
    JSON.stringify(userRecipes, null, 2)
  );

  console.log('✅ Export complete!');
  await db.close();
}

exportData().catch(console.error);
```

#### 1.3.2 Import to PostgreSQL
**קובץ**: `scripts/import-to-postgres.ts`

```typescript
import { prisma } from '../src/lib/prisma';
import fs from 'fs/promises';

async function importData() {
  console.log('📥 Importing data to PostgreSQL...');

  // Read exported data
  const recipesData = JSON.parse(
    await fs.readFile('./migration-data/recipes.json', 'utf-8')
  );

  console.log(`Importing ${recipesData.length} recipes...`);

  // Import recipes in batches (avoid timeout)
  const BATCH_SIZE = 100;
  for (let i = 0; i < recipesData.length; i += BATCH_SIZE) {
    const batch = recipesData.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((recipe: any) =>
        prisma.recipe.create({
          data: {
            id: recipe.id,
            telegram_id: recipe.telegram_id,
            title: recipe.title || '',
            raw_content: recipe.raw_content,
            ingredients: recipe._ingredients,
            instructions: recipe._instructions,
            categories: recipe._categories,
            recipe_metadata: recipe.recipe_metadata
              ? JSON.parse(recipe.recipe_metadata)
              : null,
            image_data: recipe.image_data,
            image_url: recipe.image_url,
            media_type: recipe.media_type,
            created_at: new Date(recipe.created_at),
            updated_at: recipe.updated_at
              ? new Date(recipe.updated_at)
              : new Date(recipe.created_at),
            last_sync: recipe.last_sync ? new Date(recipe.last_sync) : null,
            is_parsed: Boolean(recipe.is_parsed),
            parse_errors: recipe.parse_errors,
            status: recipe.status || 'active',
            ingredients_list: recipe.ingredients_list
              ? JSON.parse(recipe.ingredients_list)
              : null,
            cooking_time: recipe.cooking_time,
            difficulty: recipe.difficulty,
            servings: recipe.servings,
            preparation_time: recipe.preparation_time,
            formatted_content: recipe.formatted_content
              ? JSON.parse(recipe.formatted_content)
              : null,
            is_verified: Boolean(recipe.is_verified),
            sync_status: recipe.sync_status || 'synced',
            sync_error: recipe.sync_error
          }
        })
      )
    );

    console.log(`✅ Imported batch ${i / BATCH_SIZE + 1}`);
  }

  // Import menus...
  // Import other tables...

  console.log('✅ Import complete!');
}

importData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

#### 1.3.3 Run Migration
```bash
# 1. Generate Prisma client
npx prisma generate

# 2. Push schema to database
npx prisma db push

# 3. Export from SQLite
npm run migration:export

# 4. Import to PostgreSQL
npm run migration:import

# 5. Verify
npx prisma studio
```

**⚠️ Important**: גיבוי SQLite לפני Migration!
```bash
cp backend/ourRecipesBack/recipes.db backend/ourRecipesBack/recipes.db.backup
```

---

### 1.4 Next.js API Routes Structure

#### 1.4.1 Create Directory Structure
```bash
mkdir -p src/app/api/{auth,recipes,menus,categories,places,sync,versions,webhooks}
```

#### 1.4.2 Base API Response Types
**קובץ**: `src/types/api.ts`

```typescript
// Standard API response format
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

// Success helper
export function apiSuccess<T>(data: T): Response {
  return Response.json({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString() }
  } as ApiResponse<T>);
}

// Error helper
export function apiError(
  message: string,
  code: string = 'INTERNAL_ERROR',
  status: number = 500
): Response {
  return Response.json(
    {
      success: false,
      error: { code, message },
      meta: { timestamp: new Date().toISOString() }
    } as ApiResponse,
    { status }
  );
}

// Error classes
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public status: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
```

#### 1.4.3 Error Handler Middleware
**קובץ**: `src/lib/api/errorHandler.ts`

```typescript
import { ApiError, apiError } from '@/types/api';
import { Prisma } from '@prisma/client';

export function handleApiError(error: unknown): Response {
  console.error('API Error:', error);

  // Known API errors
  if (error instanceof ApiError) {
    return apiError(error.message, error.code, error.status);
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return apiError(
        'A record with this value already exists',
        'DUPLICATE_ERROR',
        409
      );
    }
    if (error.code === 'P2025') {
      return apiError('Record not found', 'NOT_FOUND', 404);
    }
  }

  // Validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    return apiError('Invalid data provided', 'VALIDATION_ERROR', 400);
  }

  // Unknown errors
  return apiError(
    process.env.NODE_ENV === 'development'
      ? (error as Error).message
      : 'Internal server error',
    'INTERNAL_ERROR',
    500
  );
}
```

#### 1.4.4 Sample API Route
**קובץ**: `src/app/api/recipes/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError } from '@/types/api';
import { handleApiError } from '@/lib/api/errorHandler';

// GET /api/recipes - List all recipes
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return apiError('userId is required', 'VALIDATION_ERROR', 400);
    }

    const recipes = await prisma.recipe.findMany({
      where: {
        user_recipes: {
          some: { user_id: userId }
        },
        status: 'active'
      },
      include: {
        user_recipes: true
      },
      orderBy: { created_at: 'desc' }
    });

    return apiSuccess(recipes);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/recipes - Create new recipe
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: Validate with Zod

    const recipe = await prisma.recipe.create({
      data: {
        telegram_id: body.telegram_id,
        title: body.title,
        raw_content: body.raw_content,
        // ... other fields
      }
    });

    // TODO: Send to Telegram service

    return apiSuccess(recipe);
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

### 1.5 Type Safety (Shared Types)

#### 1.5.1 Generate Prisma Types
```bash
npx prisma generate
```

זה יוצר types ב-`node_modules/.prisma/client`

#### 1.5.2 Create Type Exports
**קובץ**: `src/types/database.ts`

```typescript
import { Prisma } from '@prisma/client';

// Recipe types
export type Recipe = Prisma.RecipeGetPayload<{}>;
export type RecipeWithRelations = Prisma.RecipeGetPayload<{
  include: {
    user_recipes: true;
    versions: true;
    meal_recipes: {
      include: {
        meal: {
          include: {
            menu: true;
          };
        };
      };
    };
  };
}>;

export type RecipeCreateInput = Prisma.RecipeCreateInput;
export type RecipeUpdateInput = Prisma.RecipeUpdateInput;

// Menu types
export type Menu = Prisma.MenuGetPayload<{}>;
export type MenuWithMeals = Prisma.MenuGetPayload<{
  include: {
    meals: {
      include: {
        recipes: {
          include: {
            recipe: true;
          };
        };
      };
    };
  };
}>;

// ... other types
```

#### 1.5.3 Request/Response Types
**קובץ**: `src/types/requests.ts`

```typescript
import { RecipeDifficulty } from '@prisma/client';

export interface CreateRecipeRequest {
  telegram_id: number;
  title: string;
  raw_content: string;
  image_url?: string;
  categories?: string[];
}

export interface UpdateRecipeRequest {
  title?: string;
  raw_content?: string;
  image_url?: string;
  categories?: string[];
  difficulty?: RecipeDifficulty;
  cooking_time?: number;
  servings?: number;
}

export interface SearchRecipesRequest {
  query?: string;
  categories?: string[];
  difficulty?: RecipeDifficulty;
  maxCookingTime?: number;
  includeTags?: string[];
  excludeTags?: string[];
}

// ... more request types
```

---

### 1.6 Testing Infrastructure

#### 1.6.1 Install Testing Tools
```bash
npm install -D vitest @vitest/ui
npm install -D @testing-library/react @testing-library/jest-dom
npm install -D msw  # Mock Service Worker for API mocking
```

#### 1.6.2 Vitest Config
**קובץ**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

#### 1.6.3 Test Setup
**קובץ**: `tests/setup.ts`

```typescript
import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

#### 1.6.4 Mock Prisma Client
**קובץ**: `tests/mocks/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

export type MockPrisma = DeepMockProxy<PrismaClient>;

export const prismaMock = mockDeep<PrismaClient>();

export function resetPrismaMock() {
  mockReset(prismaMock);
}
```

#### 1.6.5 Sample Test
**קובץ**: `src/app/api/recipes/route.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from './route';
import { prismaMock, resetPrismaMock } from '@/tests/mocks/prisma';

describe('/api/recipes', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it('should return recipes for user', async () => {
    const mockRecipes = [
      {
        id: 1,
        telegram_id: 123,
        title: 'Test Recipe',
        raw_content: 'Test content',
        // ... other fields
      }
    ];

    prismaMock.recipe.findMany.mockResolvedValue(mockRecipes as any);

    const request = new Request(
      'http://localhost:3000/api/recipes?userId=user123'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(mockRecipes);
  });

  it('should return error if userId missing', async () => {
    const request = new Request('http://localhost:3000/api/recipes');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
});
```

#### 1.6.6 Package.json Scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

### 1.7 Logging Infrastructure

#### 1.7.1 Install Pino
```bash
npm install pino pino-pretty
```

#### 1.7.2 Logger Setup
**קובץ**: `src/lib/logger.ts`

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  }
});

// Child loggers for different modules
export const dbLogger = logger.child({ module: 'database' });
export const apiLogger = logger.child({ module: 'api' });
export const authLogger = logger.child({ module: 'auth' });
```

#### 1.7.3 Use in API Routes
```typescript
import { apiLogger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  apiLogger.info({ path: request.url }, 'GET /api/recipes');

  try {
    // ...
  } catch (error) {
    apiLogger.error({ error, path: request.url }, 'Failed to fetch recipes');
    return handleApiError(error);
  }
}
```

---

## ✅ Checklist

- [ ] Prisma installed and configured
- [ ] PostgreSQL database created
- [ ] Prisma schema created
- [ ] Prisma client singleton created
- [ ] Database migration completed
- [ ] API routes directory structure created
- [ ] Base types created (api.ts, database.ts, requests.ts)
- [ ] Error handling middleware created
- [ ] Sample API route created and tested
- [ ] Testing infrastructure setup (Vitest)
- [ ] Prisma mock created
- [ ] Sample tests written and passing
- [ ] Logger setup (Pino)
- [ ] Can read/write to DB via Prisma
- [ ] Can run tests successfully

---

## 🎯 Success Criteria

**Before moving to Phase 2, verify:**

1. **Database Works**:
   ```bash
   npm run migration:import
   npx prisma studio  # Should show all data
   ```

2. **API Route Works**:
   ```bash
   curl http://localhost:3000/api/recipes?userId=test
   # Should return recipes
   ```

3. **Tests Pass**:
   ```bash
   npm test
   # All tests should pass
   ```

4. **Logging Works**:
   - Check console for structured logs
   - Logs should include module names

---

## 📊 Estimated Time

| Task | Hours |
|------|-------|
| Prisma setup | 2-3 |
| PostgreSQL setup | 1-2 |
| Database migration | 3-4 |
| API routes structure | 2-3 |
| Type definitions | 2-3 |
| Testing infrastructure | 3-4 |
| Logging setup | 1-2 |
| **Total** | **14-21 hours** |

---

## 🔗 Next Phase

**לאחר השלמה**: [Phase 2 - API Migration](./PHASE_2_API_MIGRATION.md)

---

**Updated**: 2025-11-22
**Status**: 📝 Planned

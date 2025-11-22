# 📋 Task 1.4: Data Migration Script (SQLite → PostgreSQL)

**מזהה**: TASK-1.4
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 3-4 hours
**Priority**: 🔴 High (Critical - must have 0% data loss)

---

## 🎯 Goal

ליצור script אוטומטי שמעביר את **כל** הdata מ-SQLite ל-PostgreSQL ללא אובדן נתונים.

### Why This Task?
- יש data קיים ב-SQLite שחייב לעבור
- Migration ידני = טעויות
- צריך טיפול ב-edge cases (enums, JSON, binary data)
- חייבים 100% data integrity

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.3: Prisma Schema Creation (schema מוכן)
- [x] TASK-1.2: PostgreSQL Setup (DB מוכן)
- [x] TASK-1.1: Prisma Setup (Prisma installed)

**External dependencies:**
- [x] גישה ל-SQLite database (`backend/recipes.db`)
- [x] PostgreSQL DATABASE_URL in `.env.local`

---

## 📋 Implementation Guide

### Step 1: Analyze Current Data

**מה לעשות:**
- [ ] התחבר ל-SQLite וספור records בכל טבלה
- [ ] זהה edge cases (NULL values, special characters, enums)
- [ ] צור snapshot של data לפני migration

**Commands:**
```bash
cd backend

# Connect to SQLite
sqlite3 recipes.db

# Count records per table
.mode column
SELECT 'recipes' as table_name, COUNT(*) as count FROM recipes
UNION ALL
SELECT 'menus', COUNT(*) FROM menus
UNION ALL
SELECT 'menu_meals', COUNT(*) FROM menu_meals
UNION ALL
SELECT 'meal_recipes', COUNT(*) FROM meal_recipes
UNION ALL
SELECT 'places', COUNT(*) FROM places
UNION ALL
SELECT 'shopping_list_items', COUNT(*) FROM shopping_list_items
UNION ALL
SELECT 'recipe_versions', COUNT(*) FROM recipe_versions
UNION ALL
SELECT 'user_recipes', COUNT(*) FROM user_recipes
UNION ALL
SELECT 'sync_log', COUNT(*) FROM sync_log;

.quit
```

**Create backup:**
```bash
# Create timestamped backup
cp recipes.db recipes.db.backup.$(date +%Y%m%d_%H%M%S)

# Verify backup
ls -lh recipes.db*
```

**הנחיות:**
- רשום את מספר הrecords בכל טבלה
- שים לב לטבלאות שעשויות להיות ריקות
- זהה largest tables (לאופטימיזציה)

---

### Step 2: Create Migration Script Skeleton

**מה לעשות:**
- [ ] צור script בTypescript (tsx)
- [ ] הגדר connections ל-SQLite וPostgreSQL
- [ ] הגדר error handling

**קובץ ליצור:** `scripts/migrate-data.ts`

**מבנה:**
```typescript
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { RecipeDifficulty, DietaryType, RecipeStatus } from '@prisma/client';

const prisma = new PrismaClient();
const sqlite = new Database('./backend/recipes.db', { readonly: true });

interface MigrationStats {
  tableName: string;
  totalRecords: number;
  migratedRecords: number;
  failedRecords: number;
  errors: string[];
}

const stats: MigrationStats[] = [];

async function main() {
  console.log('🚀 Starting data migration from SQLite to PostgreSQL...\n');

  try {
    // Migration steps
    await migrateRecipes();
    await migrateMenus();
    await migrateMenuMeals();
    await migrateMealRecipes();
    await migratePlaces();
    await migrateShoppingListItems();
    await migrateRecipeVersions();
    await migrateUserRecipes();
    await migrateSyncLogs();

    // Print summary
    printSummary();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    sqlite.close();
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));

  stats.forEach(stat => {
    const success = stat.totalRecords === stat.migratedRecords;
    const icon = success ? '✅' : '⚠️';

    console.log(`${icon} ${stat.tableName}:`);
    console.log(`   Total: ${stat.totalRecords}`);
    console.log(`   Migrated: ${stat.migratedRecords}`);
    console.log(`   Failed: ${stat.failedRecords}`);

    if (stat.errors.length > 0) {
      console.log(`   Errors:`);
      stat.errors.forEach(err => console.log(`     - ${err}`));
    }
    console.log('');
  });

  const allSuccess = stats.every(s => s.totalRecords === s.migratedRecords);
  if (allSuccess) {
    console.log('✅ Migration completed successfully with 0 data loss!');
  } else {
    console.log('⚠️ Migration completed with some errors. Review above.');
  }
}

main();
```

**הנחיות:**
- TypeScript לtype-safety
- better-sqlite3 לקריאת SQLite (sync API)
- Prisma Client לכתיבת PostgreSQL
- Stats tracking לכל טבלה

---

### Step 3: Migrate Recipes (Most Complex)

**מה לעשות:**
- [ ] קרא recipes מ-SQLite
- [ ] Transform data (enums, dates, JSON)
- [ ] כתוב ל-PostgreSQL דרך Prisma

**Function להוסיף ל-script:**
```typescript
async function migrateRecipes() {
  console.log('📦 Migrating Recipes...');

  const recipes = sqlite.prepare('SELECT * FROM recipes').all();
  const stat: MigrationStats = {
    tableName: 'recipes',
    totalRecords: recipes.length,
    migratedRecords: 0,
    failedRecords: 0,
    errors: []
  };

  for (const recipe of recipes) {
    try {
      await prisma.recipe.create({
        data: {
          id: recipe.id,
          telegram_id: recipe.telegram_id,
          title: recipe.title || '',
          raw_content: recipe.raw_content,

          // Handle string fields (|| separated or plain)
          ingredients: recipe.ingredients || null,
          instructions: recipe.instructions || null,
          categories: recipe._categories || null,  // Note: _categories in SQLite!

          // Handle JSON fields
          recipe_metadata: recipe.recipe_metadata
            ? JSON.parse(recipe.recipe_metadata)
            : null,
          ingredients_list: recipe.ingredients_list
            ? JSON.parse(recipe.ingredients_list)
            : null,
          formatted_content: recipe.formatted_content
            ? JSON.parse(recipe.formatted_content)
            : null,

          // Handle binary data
          image_data: recipe.image_data
            ? Buffer.from(recipe.image_data)
            : null,
          image_url: recipe.image_url || null,
          media_type: recipe.media_type || null,

          // Handle dates
          created_at: recipe.created_at
            ? new Date(recipe.created_at)
            : new Date(),
          updated_at: recipe.updated_at
            ? new Date(recipe.updated_at)
            : null,
          last_sync: recipe.last_sync
            ? new Date(recipe.last_sync)
            : null,

          // Handle enums - CRITICAL: case conversion!
          difficulty: recipe.difficulty
            ? mapDifficulty(recipe.difficulty)
            : null,

          // Handle status enum
          status: recipe.status || 'active',

          // Numeric fields
          cooking_time: recipe.cooking_time || null,
          preparation_time: recipe.preparation_time || null,
          servings: recipe.servings || null,

          // Boolean fields
          is_parsed: recipe.is_parsed || false,
          is_verified: recipe.is_verified || false,

          // Sync fields
          sync_status: recipe.sync_status || 'synced',
          sync_error: recipe.sync_error || null,
          parse_errors: recipe.parse_errors || null
        }
      });

      stat.migratedRecords++;
    } catch (error) {
      stat.failedRecords++;
      stat.errors.push(`Recipe ${recipe.id}: ${error.message}`);
      console.error(`  ❌ Failed to migrate recipe ${recipe.id}:`, error.message);
    }
  }

  stats.push(stat);
  console.log(`  ✅ Migrated ${stat.migratedRecords}/${stat.totalRecords} recipes\n`);
}

// Helper: Map difficulty enum (lowercase → UPPERCASE)
function mapDifficulty(value: string): RecipeDifficulty | null {
  const mapping: Record<string, RecipeDifficulty> = {
    'easy': RecipeDifficulty.EASY,
    'medium': RecipeDifficulty.MEDIUM,
    'hard': RecipeDifficulty.HARD
  };
  return mapping[value.toLowerCase()] || null;
}
```

**⚠️ Critical Points:**
1. **Enum mapping**: SQLite = lowercase, Prisma = UPPERCASE
2. **JSON parsing**: SQLite stores as string, Prisma expects JSON object
3. **Date parsing**: Convert string to Date object
4. **Binary data**: Convert to Buffer
5. **Field names**: `_categories` in SQLite, `categories` in Prisma schema

---

### Step 4: Migrate Menus

**Function להוסיף:**
```typescript
async function migrateMenus() {
  console.log('📦 Migrating Menus...');

  const menus = sqlite.prepare('SELECT * FROM menus').all();
  const stat: MigrationStats = {
    tableName: 'menus',
    totalRecords: menus.length,
    migratedRecords: 0,
    failedRecords: 0,
    errors: []
  };

  for (const menu of menus) {
    try {
      await prisma.menu.create({
        data: {
          id: menu.id,
          user_id: menu.user_id,
          telegram_message_id: menu.telegram_message_id || null,
          name: menu.name,
          event_type: menu.event_type || null,
          description: menu.description || null,
          total_servings: menu.total_servings || 4,

          // Enum mapping
          dietary_type: menu.dietary_type
            ? mapDietaryType(menu.dietary_type)
            : null,

          share_token: menu.share_token,
          is_public: menu.is_public || false,

          // JSON fields
          ai_reasoning: menu.ai_reasoning || null,
          generation_prompt: menu.generation_prompt || null,

          // Dates
          created_at: menu.created_at
            ? new Date(menu.created_at)
            : new Date(),
          updated_at: menu.updated_at
            ? new Date(menu.updated_at)
            : null,
          last_sync: menu.last_sync
            ? new Date(menu.last_sync)
            : null
        }
      });

      stat.migratedRecords++;
    } catch (error) {
      stat.failedRecords++;
      stat.errors.push(`Menu ${menu.id}: ${error.message}`);
      console.error(`  ❌ Failed to migrate menu ${menu.id}:`, error.message);
    }
  }

  stats.push(stat);
  console.log(`  ✅ Migrated ${stat.migratedRecords}/${stat.totalRecords} menus\n`);
}

function mapDietaryType(value: string): DietaryType | null {
  const mapping: Record<string, DietaryType> = {
    'meat': DietaryType.MEAT,
    'dairy': DietaryType.DAIRY,
    'pareve': DietaryType.PAREVE
  };
  return mapping[value.toLowerCase()] || null;
}
```

---

### Step 5: Migrate Remaining Tables

**מה לעשות:**
- [ ] צור functions דומות לכל טבלה
- [ ] שים לב ל-foreign keys (migrate בסדר הנכון!)

**Order matters! (Foreign key dependencies):**
```
1. Recipes (no dependencies)
2. Menus (no dependencies)
3. MenuMeals (depends on Menus)
4. MealRecipes (depends on MenuMeals + Recipes)
5. ShoppingListItems (depends on Menus)
6. RecipeVersions (depends on Recipes)
7. UserRecipes (depends on Recipes)
8. Places (no dependencies)
9. SyncLogs (no dependencies)
```

**Templates for each:**

**MenuMeals:**
```typescript
async function migrateMenuMeals() {
  console.log('📦 Migrating Menu Meals...');
  const meals = sqlite.prepare('SELECT * FROM menu_meals').all();
  // ... similar to above
  // FK: menu_id references menus(id)
}
```

**MealRecipes:**
```typescript
async function migrateMealRecipes() {
  console.log('📦 Migrating Meal Recipes...');
  const mealRecipes = sqlite.prepare('SELECT * FROM meal_recipes').all();
  // FK: menu_meal_id, recipe_id
}
```

**Places:**
```typescript
async function migratePlaces() {
  console.log('📦 Migrating Places...');
  const places = sqlite.prepare('SELECT * FROM places').all();
  // No FK dependencies
}
```

**ShoppingListItems:**
```typescript
async function migrateShoppingListItems() {
  console.log('📦 Migrating Shopping List Items...');
  const items = sqlite.prepare('SELECT * FROM shopping_list_items').all();
  // FK: menu_id
}
```

**RecipeVersions:**
```typescript
async function migrateRecipeVersions() {
  console.log('📦 Migrating Recipe Versions...');
  const versions = sqlite.prepare('SELECT * FROM recipe_versions').all();
  // FK: recipe_id
  // Handle: content (JSON), image_data (Bytes)
}
```

**UserRecipes:**
```typescript
async function migrateUserRecipes() {
  console.log('📦 Migrating User Recipes...');
  const userRecipes = sqlite.prepare('SELECT * FROM user_recipes').all();
  // FK: recipe_id
}
```

**SyncLogs:**
```typescript
async function migrateSyncLogs() {
  console.log('📦 Migrating Sync Logs...');
  const logs = sqlite.prepare('SELECT * FROM sync_log').all();
  // No FK dependencies
  // All fields are straightforward
}
```

---

### Step 6: Add Error Handling & Retry Logic

**מה לעשות:**
- [ ] טיפול בduplicates (unique constraints)
- [ ] Retry logic לtimeouts
- [ ] Partial migration recovery

**הוסף לscript:**
```typescript
// Retry wrapper
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;

    console.log(`  ⚠️ Retry in ${delay}ms... (${retries} left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// Use in migration:
await withRetry(() => prisma.recipe.create({ data: ... }));
```

---

### Step 7: Add Verification Step

**מה לעשות:**
- [ ] אחרי migration, ספור records בPostgreSQL
- [ ] השווה עם SQLite
- [ ] דווח על differences

**הוסף בסוף main():**
```typescript
async function verifyMigration() {
  console.log('\n🔍 Verifying migration...\n');

  const checks = [
    { name: 'recipes', sqlite: 'recipes', prisma: 'recipe' },
    { name: 'menus', sqlite: 'menus', prisma: 'menu' },
    { name: 'menu_meals', sqlite: 'menu_meals', prisma: 'menuMeal' },
    { name: 'meal_recipes', sqlite: 'meal_recipes', prisma: 'mealRecipe' },
    { name: 'places', sqlite: 'places', prisma: 'place' },
    { name: 'shopping_list_items', sqlite: 'shopping_list_items', prisma: 'shoppingListItem' },
    { name: 'recipe_versions', sqlite: 'recipe_versions', prisma: 'recipeVersion' },
    { name: 'user_recipes', sqlite: 'user_recipes', prisma: 'userRecipe' },
    { name: 'sync_log', sqlite: 'sync_log', prisma: 'syncLog' }
  ];

  for (const check of checks) {
    const sqliteCount = sqlite
      .prepare(`SELECT COUNT(*) as count FROM ${check.sqlite}`)
      .get().count;

    const postgresCount = await prisma[check.prisma].count();

    const match = sqliteCount === postgresCount;
    const icon = match ? '✅' : '❌';

    console.log(
      `${icon} ${check.name}: SQLite=${sqliteCount}, PostgreSQL=${postgresCount}`
    );
  }
}

// Call at end of main():
await verifyMigration();
```

---

### Step 8: Create Migration Runner

**מה לעשות:**
- [ ] הוסף script ל-package.json
- [ ] צור instructions למשתמש

**Update package.json:**
```json
{
  "scripts": {
    "migrate:data": "tsx scripts/migrate-data.ts"
  }
}
```

**Install dependencies:**
```bash
npm install better-sqlite3 @types/better-sqlite3 --save-dev
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] Migration script exists and runs
- [x] All 9 tables migrated
- [x] 0% data loss (all records transferred)
- [x] Foreign keys maintain integrity
- [x] Enums converted correctly
- [x] JSON fields parsed correctly
- [x] Binary data transferred correctly

### Data Integrity:
- [x] Record counts match (SQLite = PostgreSQL)
- [x] Sample data verification passes
- [x] No duplicate records
- [x] No NULL where NOT NULL
- [x] All unique constraints satisfied

### Technical Requirements:
- [x] Script runs without errors
- [x] Stats printed clearly
- [x] Errors logged if any
- [x] Verification step included

---

## 🧪 Testing Instructions

### Pre-Migration Checklist:
```bash
# 1. Backup SQLite
cp backend/recipes.db backend/recipes.db.backup

# 2. Count records in SQLite
sqlite3 backend/recipes.db "SELECT COUNT(*) FROM recipes;"
sqlite3 backend/recipes.db "SELECT COUNT(*) FROM menus;"
# ... for all tables

# 3. Ensure PostgreSQL is empty
npx prisma db push --force-reset  # ⚠️ Deletes all data!
```

### Run Migration:
```bash
cd frontend/ourRecipesFront
npm run migrate:data
```

### Expected Output:
```
🚀 Starting data migration from SQLite to PostgreSQL...

📦 Migrating Recipes...
  ✅ Migrated 150/150 recipes

📦 Migrating Menus...
  ✅ Migrated 25/25 menus

... (all tables)

🔍 Verifying migration...

✅ recipes: SQLite=150, PostgreSQL=150
✅ menus: SQLite=25, PostgreSQL=25
...

✅ Migration completed successfully with 0 data loss!
```

### Post-Migration Verification:
```bash
# 1. Open Prisma Studio
npm run prisma:studio

# 2. Manually check:
- Recipe with telegram_id exists
- JSON fields parsed correctly
- Images visible (image_data not NULL)
- Enums are UPPERCASE
- Dates are correct format

# 3. Run sample queries
npx prisma db seed  # (if you have seed script)
```

### Manual Data Sampling:
```typescript
// Test script: scripts/verify-sample.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Sample recipe
  const recipe = await prisma.recipe.findFirst({
    include: {
      user_recipes: true,
      versions: true
    }
  });
  console.log('Sample Recipe:', JSON.stringify(recipe, null, 2));

  // Sample menu
  const menu = await prisma.menu.findFirst({
    include: {
      meals: {
        include: {
          recipes: true
        }
      }
    }
  });
  console.log('Sample Menu:', JSON.stringify(menu, null, 2));
}

main();
```

---

## 🔄 Rollback Strategy

**אם Migration נכשל:**

### Option 1: Reset PostgreSQL
```bash
# Delete all data in PostgreSQL
npx prisma db push --force-reset

# SQLite is still intact, can retry
npm run migrate:data
```

### Option 2: Restore SQLite (if corrupted)
```bash
cp backend/recipes.db.backup backend/recipes.db
```

### Option 3: Partial Migration Recovery
```typescript
// If some tables migrated, some failed:
// Modify script to skip already-migrated tables

const skipTables = ['recipes', 'menus'];  // Already done

if (!skipTables.includes('recipes')) {
  await migrateRecipes();
}
```

**Best Practice:**
- Always backup before migration
- Run in dev environment first
- Verify thoroughly before production

---

## 📊 Estimated Time

- **Minimum**: 2 hours (small dataset, no errors)
- **Expected**: 3 hours
- **Maximum**: 4 hours (large dataset, edge cases)

**Breakdown:**
- Write migration functions: 1.5 hours
- Test & debug: 1 hour
- Verification: 30 min
- Documentation: 30 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Enum Mapping (CRITICAL!):**
```
SQLite: "easy", "medium", "hard"
Prisma: EASY, MEDIUM, HARD

Solution: mapDifficulty() function
```

**2. JSON Parsing:**
```typescript
// SQLite stores JSON as string
recipe.ingredients_list = '{"name": "..."}'

// Prisma expects object
ingredients_list: JSON.parse(recipe.ingredients_list)
```

**3. Binary Data:**
```typescript
// SQLite: Buffer or Uint8Array
// Prisma: Buffer
image_data: Buffer.from(recipe.image_data)
```

**4. Dates:**
```typescript
// SQLite: string "2024-01-01 12:00:00"
// Prisma: Date object
created_at: new Date(recipe.created_at)
```

**5. NULL Handling:**
```typescript
// Use || null for optional fields
title: recipe.title || null  // NOT undefined!
```

### Potential Issues:

**Issue 1**: Unique constraint violation
- **Cause**: Duplicate telegram_id or share_token
- **Solution**:
  ```typescript
  try {
    await prisma.recipe.create({ data });
  } catch (error) {
    if (error.code === 'P2002') {
      console.warn('Duplicate found, skipping...');
    }
  }
  ```

**Issue 2**: Foreign key constraint violation
- **Cause**: Wrong migration order
- **Solution**: Follow dependency order (see Step 5)

**Issue 3**: JSON parse errors
- **Cause**: Malformed JSON in SQLite
- **Solution**:
  ```typescript
  try {
    ingredients_list: JSON.parse(recipe.ingredients_list)
  } catch {
    ingredients_list: null  // Skip malformed JSON
  }
  ```

**Issue 4**: Large binary data timeout
- **Cause**: Image data > 10MB
- **Solution**: Batch processing, increase timeout

### Performance Optimization:

**For large datasets (>1000 records):**
```typescript
// Use transactions for better performance
await prisma.$transaction(async (tx) => {
  for (const recipe of recipes) {
    await tx.recipe.create({ data: recipe });
  }
});

// Or batch creates
await prisma.recipe.createMany({
  data: recipes,
  skipDuplicates: true
});
```

**Note**: `createMany` doesn't support relations, so use for simple tables only.

### References:
- [Prisma Data Migration Guide](https://www.prisma.io/docs/guides/migrate/seed-database)
- [better-sqlite3 Docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [Prisma Error Reference](https://www.prisma.io/docs/reference/api-reference/error-reference)

---

## 🔗 Related Tasks

**Depends on:**
- TASK-1.1: Prisma Setup
- TASK-1.2: PostgreSQL Setup
- TASK-1.3: Prisma Schema Creation (schema must match!)

**Blocks:**
- TASK-2.x: API Migration (needs data in PostgreSQL)
- Phase 2 in general (can't test without data)

**Can run in parallel:**
- None (this is critical path)

---

## ✏️ AI Agent Instructions

**For Claude Code or similar AI agents:**

```
Task: Create data migration script from SQLite to PostgreSQL

Context:
- SQLite database: backend/recipes.db (production data!)
- PostgreSQL: via Prisma (already setup)
- 9 tables to migrate
- ~150-500 records total (exact count TBD)
- Contains enums, JSON, binary data, foreign keys

Your job:
1. Create scripts/migrate-data.ts
2. Install better-sqlite3 dependency
3. Implement migration for each table (9 functions)
4. Handle enum conversion (lowercase → UPPERCASE)
5. Handle JSON parsing (string → object)
6. Handle binary data (Buffer conversion)
7. Handle dates (string → Date)
8. Maintain foreign key order
9. Add verification step
10. Add error handling and stats

Critical data transformations:
- Enums: easy → EASY, medium → MEDIUM, hard → HARD
- Enums: meat → MEAT, dairy → DAIRY, pareve → PAREVE
- JSON fields: Parse from string to object
- Dates: Convert string to Date object
- Binary: Convert to Buffer

Order of migration (FK dependencies):
1. Recipes
2. Menus
3. MenuMeals (FK: Menus)
4. MealRecipes (FK: MenuMeals, Recipes)
5. ShoppingListItems (FK: Menus)
6. RecipeVersions (FK: Recipes)
7. UserRecipes (FK: Recipes)
8. Places
9. SyncLogs

Success criteria:
- 0% data loss
- All record counts match
- No foreign key violations
- Verification passes

Expected output:
- scripts/migrate-data.ts created
- package.json updated with migrate:data script
- Migration runs successfully
- Verification shows all counts match
- Success message: "Migration completed with 0 data loss"

Verification commands:
1. npm run migrate:data
   Expected: ✅ All tables migrated successfully
2. npm run prisma:studio
   Expected: Data visible in PostgreSQL
3. Count verification matches
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead
**Criticality**: 🔴 HIGH - Data migration is critical path

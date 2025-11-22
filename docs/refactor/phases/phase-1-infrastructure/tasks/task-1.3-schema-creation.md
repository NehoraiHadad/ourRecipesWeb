# 📋 Task 1.3: Prisma Schema Creation

**מזהה**: TASK-1.3
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 3-4 hours

---

## 🎯 Goal

להמיר את כל ה-SQLAlchemy models ל-Prisma schema, תוך שמירה על תאימות מלאה של המבנה והנתונים.

### Why This Task?
- Prisma schema הוא ה-"single source of truth" למבנה ה-DB
- צריך תאימות 100% עם SQLAlchemy כדי ש-migration יצליח
- הSchema מגדיר את כל הTypes שישמשו את הפרויקט

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.1: Prisma Setup (prisma מותקן)
- [x] TASK-1.2: PostgreSQL Setup (יש database)

**External dependencies:**
- [x] גישה לקוד SQLAlchemy הקיים (`backend/ourRecipesBack/models/`)
- [x] מסמך `docs/refactor/CURRENT_STATE.md` (לבדיקה)

---

## 📋 Implementation Guide

### Step 1: Analyze SQLAlchemy Models
**מה לעשות:**
- [ ] קרא את כל ה-model files ב-`backend/ourRecipesBack/models/`
- [ ] רשום את כל השדות, הטיפוסים, וה-relationships
- [ ] זהה unique constraints, indexes, defaults

**קבצים לקרוא:**
```
backend/ourRecipesBack/models/
├── recipe.py          # Recipe model - הכי מורכב!
├── menu.py            # Menu, MenuMeal, MealRecipe
├── place.py           # Place model
├── shopping_list.py   # ShoppingListItem
├── version.py         # RecipeVersion
├── user_recipe.py     # UserRecipe (join table)
├── sync.py            # SyncLog
└── enums.py           # All enums
```

**הנחיות:**
- שים לב ל-field names (יש underscores, לדוגמה: `_ingredients`)
- זהה JSON fields (הם צריכים `Json` type ב-Prisma)
- זהה Bytes fields (image_data)
- זהה relationships (ForeignKey, back_populates)

**טבלת המרה:**
| SQLAlchemy | Prisma |
|------------|--------|
| `String(255)` | `String @db.VarChar(255)` |
| `Text` | `String @db.Text` |
| `Integer` | `Int` |
| `Boolean` | `Boolean` |
| `DateTime` | `DateTime` |
| `JSON` | `Json` |
| `LargeBinary` | `Bytes` |
| `Enum('a','b')` | `enum MyEnum { A B }` |

---

### Step 2: Create Enums
**מה לעשות:**
- [ ] פתח את `prisma/schema.prisma`
- [ ] הוסף את כל ה-enums מ-`models/enums.py`

**קובץ לעדכן:** `prisma/schema.prisma`

**Enums להוסיף:**
```prisma
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

// Add others if needed (check enums.py)
```

**הנחיות:**
- שמות Enum צריכים UPPERCASE ב-Prisma
- Python: `RecipeDifficulty.EASY`, Prisma: `RecipeDifficulty.EASY`
- וודא תאימות מלאה עם Python enums

---

### Step 3: Create Recipe Model
**מה לעשות:**
- [ ] הוסף Recipe model ל-schema
- [ ] כלול את כל השדות מ-`models/recipe.py`
- [ ] הגדר indexes וunique constraints

**קובץ לעדכן:** `prisma/schema.prisma`

**שדות חשובים לשים לב אליהם:**

1. **telegram_id** - חייב להיות `@unique` (קריטי!)
2. **ingredients** - זה `String?` לא Json (|| separated)
3. **categories** - זה `String?` לא Json (comma separated)
4. **ingredients_list** - זה `Json?` (parsed structure)
5. **formatted_content** - זה `Json?`
6. **image_data** - זה `Bytes?` (binary data)
7. **created_at** - `@default(now())`
8. **updated_at** - `@updatedAt` (auto-update!)

**Relationships:**
```prisma
model Recipe {
  id           Int    @id @default(autoincrement())
  // ... fields ...

  // Relations
  user_recipes UserRecipe[]
  versions     RecipeVersion[]
  meal_recipes MealRecipe[]

  @@index([telegram_id])
  @@map("recipes")  // Table name in DB
}
```

**⚠️ Critical Fields:**
- `telegram_id Int @unique` - אם זה לא unique, migration ייכשל!
- `raw_content String @db.Text` - חובה, לא nullable
- `@@map("recipes")` - שם הטבלה ב-DB (lowercase)

---

### Step 4: Create Menu Models
**מה לעשות:**
- [ ] הוסף Menu model
- [ ] הוסף MenuMeal model
- [ ] הוסף MealRecipe model
- [ ] הגדר relationships ביניהם

**קובץ לעדכן:** `prisma/schema.prisma`

**Relationships Structure:**
```
Menu
 ├── meals: MenuMeal[]
 └── shopping_list_items: ShoppingListItem[]

MenuMeal
 ├── menu: Menu (FK)
 └── recipes: MealRecipe[]

MealRecipe
 ├── meal: MenuMeal (FK)
 └── recipe: Recipe (FK)
```

**הנחיות:**
- Menu.meals צריך `orderBy: [meal_order]`
- MenuMeal.recipes צריך `orderBy: [course_order]`
- `onDelete: Cascade` על כל ה-FKs (כמו ב-SQLAlchemy)
- `share_token` חייב `@unique`

---

### Step 5: Create Supporting Models
**מה לעשות:**
- [ ] הוסף Place model
- [ ] הוסף ShoppingListItem model
- [ ] הוסף RecipeVersion model
- [ ] הוסף UserRecipe model
- [ ] הוסף SyncLog model

**קובץ לעדכן:** `prisma/schema.prisma`

**הנחיות לכל model:**

**Place:**
- `is_deleted` - soft delete flag
- כל השדות optional מלבד `name`, `created_by`, `created_at`

**ShoppingListItem:**
- FK ל-Menu עם `onDelete: Cascade`
- `@@index([menu_id, category])` - composite index

**RecipeVersion:**
- `content` הוא `Json`
- `image_data` הוא `Bytes?`
- FK ל-Recipe עם `onDelete: Cascade`

**UserRecipe:**
- FK ל-Recipe עם `onDelete: Cascade`
- `@@index([user_id, recipe_id])` - composite index

**SyncLog:**
- כל השדות הם counters (Int @default(0))
- `status` הוא String לא Enum (יש הרבה ערכים)

---

### Step 6: Validate Schema Structure
**מה לעשות:**
- [ ] בדוק שכל ה-relationships מוגדרים בשני הכיוונים
- [ ] וודא שכל ה-FKs עם `onDelete: Cascade` או `onDelete: Restrict`
- [ ] בדוק שכל ה-indexes קיימים

**Commands:**
```bash
npx prisma validate
```

**Expected output:**
```
✔ Prisma schema loaded from prisma/schema.prisma
✔ Datasource "db": PostgreSQL database "..." at "..."
```

**Checklist:**
- [ ] כל Model יש `@@map("table_name")` בlowercase
- [ ] כל Relation יש גם `@relation` וגם back-reference
- [ ] Indexes מוגדרים: `@@index([field])` או `@@index([field1, field2])`
- [ ] Uniques מוגדרים: `@unique` או `@@unique([field1, field2])`

---

### Step 7: Generate Prisma Client
**מה לעשות:**
- [ ] הרץ `prisma generate`
- [ ] וודא שנוצר client ללא שגיאות

**Commands:**
```bash
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client (X.X.X) to ./node_modules/@prisma/client
```

**זה יוצר:**
- TypeScript types ב-`node_modules/@prisma/client`
- Type-safe query functions
- Inferred types לכל model

---

### Step 8: Create Schema Comparison Document
**מה לעשות:**
- [ ] צור קובץ documentation שמשווה SQLAlchemy ל-Prisma
- [ ] רשום כל שינוי או החלטה

**קובץ ליצור:** `docs/refactor/mappings/schema-comparison.md`

**תוכן:**
- טבלת השוואה: SQLAlchemy model → Prisma model
- שינויים שנעשו (אם יש)
- החלטות (למה בחרנו X ולא Y)

**דוגמה:**
```markdown
| SQLAlchemy Field | Prisma Field | Notes |
|------------------|--------------|-------|
| `_ingredients: Text` | `ingredients: String? @db.Text` | Renamed (removed _) |
| `recipe_metadata: JSON` | `recipe_metadata: Json?` | Type mapping |
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] כל 10 Models מוגדרים ב-schema
- [x] כל Enums מוגדרים
- [x] כל Relationships תקינים (bidirectional)
- [x] כל Indexes קיימים
- [x] Schema-comparison.md נוצר

### Technical Requirements:
- [x] `npx prisma validate` עובר ללא שגיאות
- [x] `npx prisma generate` רץ בהצלחה
- [x] TypeScript מזהה את `@prisma/client`
- [x] אין warnings ב-console

### Data Integrity:
- [x] Field names מתאימים ל-SQLAlchemy (case-sensitive)
- [x] Field types מתאימים (String/Int/DateTime/etc)
- [x] Nullable fields מתאימים (?)
- [x] Default values מתאימים (@default)
- [x] Unique constraints מתאימים (@unique)

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: Schema Validation**
```bash
npx prisma validate
# Expected: ✔ No schema errors
```

**Test 2: Client Generation**
```bash
npx prisma generate
# Expected: ✔ Generated Prisma Client
```

**Test 3: Type Checking**
```typescript
// Create test file
import { PrismaClient, RecipeDifficulty } from '@prisma/client';

const prisma = new PrismaClient();

// This should have full autocomplete:
async function test() {
  const recipe = await prisma.recipe.findFirst({
    where: {
      difficulty: RecipeDifficulty.EASY
    },
    include: {
      user_recipes: true,
      versions: true
    }
  });
}
```

**Expected:**
- Full TypeScript autocomplete
- No type errors
- IntelliSense shows all fields

**Test 4: Compare with SQLAlchemy**
```bash
# Count models in SQLAlchemy
ls backend/ourRecipesBack/models/*.py | wc -l

# Count models in Prisma
grep "^model " prisma/schema.prisma | wc -l

# Should match (or close)
```

---

## 🔄 Rollback Strategy

**אם Schema לא תקין:**

1. **Revert schema.prisma:**
   ```bash
   git checkout prisma/schema.prisma
   ```

2. **Or restore backup:**
   ```bash
   cp prisma/schema.prisma.backup prisma/schema.prisma
   ```

3. **Clean generated files:**
   ```bash
   rm -rf node_modules/.prisma/
   npx prisma generate
   ```

**Best practice**: Commit לפני pushing to DB!

---

## 📊 Estimated Time

- **Minimum**: 2 hours (אם משתמש ב-CURRENT_STATE.md)
- **Expected**: 3 hours
- **Maximum**: 4 hours (אם יש שגיאות validation)

**Breakdown:**
- Analyze models: 30 min
- Create enums: 15 min
- Recipe model: 45 min (המורכב ביותר)
- Menu models: 30 min
- Supporting models: 30 min
- Validation & testing: 30 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Field Naming:**
- SQLAlchemy: `_ingredients` (private)
- Prisma: `ingredients` (no underscore)
- Migration script צריך לטפל בזה!

**2. JSON vs String:**
```prisma
// SQLAlchemy: stored as || separated string
ingredients: String?  // "חומר1||חומר2"

// SQLAlchemy: stored as JSON string
ingredients_list: Json?  // [{name: "...", amount: "..."}]
```

**3. Enum Mapping:**
```python
# SQLAlchemy
class RecipeDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
```

```prisma
// Prisma
enum RecipeDifficulty {
  EASY    // stored as "EASY" in DB
  MEDIUM
  HARD
}
```

**⚠️ Potential Issue**: Enum values באותיות קטנות ב-SQLite (`"easy"`) אבל גדולות ב-Prisma (`"EASY"`).

**Solution**: Migration script צריך להמיר!

**4. DateTime Handling:**
```prisma
created_at DateTime @default(now())  // Auto-set on create
updated_at DateTime @updatedAt        // Auto-update on change
```

**5. Cascade Deletes:**
```prisma
// When menu deleted, all meals should delete too
model MenuMeal {
  menu Menu @relation(fields: [menu_id], references: [id], onDelete: Cascade)
}
```

### Potential Issues:

**Issue 1**: Circular dependencies בrelationships
- **Solution**: Use `@relation(name: "CustomName")` לדיסמביגציה

**Issue 2**: Type mismatch errors
- **Solution**: Double-check SQLAlchemy types vs Prisma types

**Issue 3**: Missing indexes
- **Solution**: Check SQLAlchemy `@db.Index()` decorators

### References:
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Prisma Relations](https://www.prisma.io/docs/concepts/components/prisma-schema/relations)
- [Migrating from SQLAlchemy](https://www.prisma.io/docs/guides/migrate-to-prisma/migrate-from-sqlalchemy)

---

## 🔗 Related Tasks

**Depends on:**
- TASK-1.1: Prisma Setup (needs prisma installed)
- TASK-1.2: PostgreSQL Setup (needs DB for validation)

**Blocks:**
- TASK-1.4: Migration Script (needs schema to migrate to)
- TASK-1.6: Types Setup (needs generated types)

**Can run in parallel with:**
- TASK-1.5: API Routes Structure (independent)
- TASK-1.7: Testing Infrastructure (independent)
- TASK-1.8: Logging Setup (independent)

---

## ✏️ AI Agent Instructions

**For Claude Code or similar AI agents:**

```
Task: Convert SQLAlchemy models to Prisma schema

Context:
- 10 SQLAlchemy models in backend/ourRecipesBack/models/
- Current database: SQLite
- Target database: PostgreSQL
- Schema must be 100% compatible for data migration

Your job:
1. Read all model files in backend/ourRecipesBack/models/
2. Identify all fields, types, relationships, indexes
3. Create corresponding Prisma schema in prisma/schema.prisma
4. Ensure exact field name matching (case-sensitive!)
5. Map SQLAlchemy types to Prisma types correctly
6. Add all indexes and constraints
7. Validate schema with `npx prisma validate`
8. Generate client with `npx prisma generate`
9. Create schema-comparison.md documenting the mapping

Constraints:
- Do NOT change field names arbitrarily
- Do NOT skip any models or fields
- Ensure `telegram_id` is @unique (critical!)
- All relations must be bidirectional
- Use @@map("table_name") for all models
- Cascade deletes where appropriate

Critical mappings:
- recipe._ingredients → ingredients: String? (|| separated)
- recipe.ingredients_list → ingredients_list: Json?
- image_data → Bytes?
- Enum values: lowercase in SQLite, UPPERCASE in Prisma

Expected output:
- Complete prisma/schema.prisma with 10 models
- All enums defined
- All relationships working
- docs/refactor/mappings/schema-comparison.md created
- Success: `npx prisma validate` passes

Verification:
1. Run: npx prisma validate
2. Run: npx prisma generate
3. Check: TypeScript autocomplete works
4. Count: 10 models in schema
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

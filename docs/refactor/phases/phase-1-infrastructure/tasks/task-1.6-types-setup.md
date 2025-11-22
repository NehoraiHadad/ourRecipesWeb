# 📋 Task 1.6: TypeScript Types Setup

**מזהה**: TASK-1.6
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 2-3 hours

---

## 🎯 Goal

ליצור TypeScript types מרכזיים שישמשו את הפרויקט כולו - Frontend, Backend, ו-Shared types.

### Why This Task?
- Type safety end-to-end
- Shared types בין frontend ו-backend
- Autocomplete בכל מקום
- Catch errors בcompile time

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.3: Prisma Schema Creation (Prisma types generated)

**Nice to have:**
- [ ] TASK-1.1: Prisma Setup

---

## 📋 Implementation Guide

### Step 1: Create Types Directory Structure

**מה לעשות:**
- [ ] צור תיקיית types
- [ ] ארגן לפי קטגוריות

**Structure:**
```bash
mkdir -p lib/types

# Final structure:
lib/types/
├── index.ts              # Re-export all types
├── database.ts           # Database/Prisma types
├── api.ts                # API request/response types
├── models.ts             # Domain models
├── enums.ts              # Shared enums
└── utils.ts              # Utility types
```

---

### Step 2: Database Types (Prisma-based)

**מה לעשות:**
- [ ] Re-export Prisma types
- [ ] Create enhanced types with relations

**קובץ ליצור:** `lib/types/database.ts`

**תוכן:**
```typescript
/**
 * Database types - based on Prisma schema
 */
import { Prisma } from '@prisma/client';

// Re-export Prisma generated types
export type {
  Recipe,
  Menu,
  MenuMeal,
  MealRecipe,
  Place,
  ShoppingListItem,
  RecipeVersion,
  UserRecipe,
  SyncLog,
  RecipeDifficulty,
  DietaryType
} from '@prisma/client';

/**
 * Recipe with relations
 */
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

/**
 * Recipe with user recipes only
 */
export type RecipeWithUsers = Prisma.RecipeGetPayload<{
  include: {
    user_recipes: true;
  };
}>;

/**
 * Menu with full structure
 */
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
    shopping_list_items: true;
  };
}>;

/**
 * Menu with basic meals (no recipes)
 */
export type MenuWithBasicMeals = Prisma.MenuGetPayload<{
  include: {
    meals: true;
  };
}>;

/**
 * Shared shopping list view
 */
export type MenuForSharing = Prisma.MenuGetPayload<{
  include: {
    meals: {
      include: {
        recipes: {
          include: {
            recipe: {
              select: {
                id: true;
                title: true;
                ingredients_list: true;
              };
            };
          };
        };
      };
    };
    shopping_list_items: true;
  };
}>;

/**
 * Create/Update input types (exclude auto-generated fields)
 */
export type RecipeCreateInput = Omit<
  Prisma.RecipeCreateInput,
  'id' | 'created_at' | 'updated_at' | 'user_recipes' | 'versions' | 'meal_recipes'
>;

export type RecipeUpdateInput = Partial<
  Omit<RecipeCreateInput, 'telegram_id'>
>;

export type MenuCreateInput = Omit<
  Prisma.MenuCreateInput,
  'id' | 'created_at' | 'updated_at' | 'meals' | 'shopping_list_items'
>;

export type MenuUpdateInput = Partial<
  Omit<MenuCreateInput, 'share_token'>
>;
```

**הנחיות:**
- Use `Prisma.XGetPayload` לtypes עם includes
- Create helper types לcommon queries
- Exclude auto-generated fields (id, timestamps) מCreate types

---

### Step 3: API Request/Response Types

**קובץ ליצור:** `lib/types/api.ts`

**תוכן:**
```typescript
/**
 * API request and response types
 */

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  error: {
    message: string;
    statusCode: number;
    errors?: ValidationError[];
  };
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

/**
 * Pagination params
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Search params
 */
export interface SearchParams extends PaginationParams {
  query?: string;
  category?: string;
  difficulty?: string;
  sortBy?: 'created_at' | 'title' | 'cooking_time';
  sortOrder?: 'asc' | 'desc';
}

// ========================================
// Recipe API Types
// ========================================

/**
 * Create recipe request
 */
export interface CreateRecipeRequest {
  telegram_id: number;
  title?: string;
  raw_content: string;
  ingredients?: string[];
  instructions?: string;
  categories?: string[];
  image_url?: string;
  cooking_time?: number;
  difficulty?: string;
  servings?: number;
}

/**
 * Update recipe request
 */
export interface UpdateRecipeRequest {
  title?: string;
  raw_content?: string;
  ingredients?: string[];
  instructions?: string;
  categories?: string[];
  image_url?: string;
  cooking_time?: number;
  difficulty?: string;
  servings?: number;
}

/**
 * Recipe search response
 */
export interface RecipeSearchResult {
  id: number;
  telegram_id: number;
  title: string;
  categories: string | null;
  difficulty: string | null;
  cooking_time: number | null;
  image_url: string | null;
}

// ========================================
// Menu API Types
// ========================================

/**
 * Generate menu request
 */
export interface GenerateMenuRequest {
  user_id: string;
  event_type?: string;
  total_servings: number;
  dietary_type?: 'MEAT' | 'DAIRY' | 'PAREVE';
  preferences?: string[];
  exclude_recipes?: number[];
}

/**
 * Menu generation preview (AI response)
 */
export interface MenuGenerationPreview {
  name: string;
  event_type?: string;
  meals: MenuMealPreview[];
  reasoning: string;
}

export interface MenuMealPreview {
  meal_type: string;
  meal_order: number;
  recipes: MenuRecipePreview[];
}

export interface MenuRecipePreview {
  recipe_id: number;
  course_type?: string;
  course_order: number;
  servings?: number;
  reason?: string;
}

/**
 * Save menu request
 */
export interface SaveMenuRequest {
  user_id: string;
  name: string;
  event_type?: string;
  total_servings: number;
  dietary_type?: 'MEAT' | 'DAIRY' | 'PAREVE';
  meals: MenuMealInput[];
  ai_reasoning?: string;
  generation_prompt?: string;
}

export interface MenuMealInput {
  meal_type: string;
  meal_order: number;
  meal_time?: string;
  notes?: string;
  recipes: MenuRecipeInput[];
}

export interface MenuRecipeInput {
  recipe_id: number;
  course_type?: string;
  course_order: number;
  servings?: number;
  notes?: string;
  ai_reason?: string;
}

// ========================================
// Shopping List API Types
// ========================================

export interface ShoppingListItemInput {
  ingredient_name: string;
  quantity?: string;
  category?: string;
  notes?: string;
}

export interface UpdateShoppingListItemRequest {
  is_checked?: boolean;
  notes?: string;
}

// ========================================
// AI API Types
// ========================================

/**
 * AI recipe suggestion request
 */
export interface RecipeSuggestionRequest {
  preferences: string[];
  dietary_type?: 'MEAT' | 'DAIRY' | 'PAREVE';
  servings?: number;
  cooking_time_max?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}

/**
 * Recipe reformat request
 */
export interface RecipeReformatRequest {
  raw_content: string;
}

/**
 * Recipe refine request
 */
export interface RecipeRefineRequest {
  recipe_id: number;
  refinement_instructions: string;
}

// ========================================
// Telegram API Types
// ========================================

/**
 * Telegram message data (from Python service)
 */
export interface TelegramMessageData {
  message_id: number;
  content: string;
  image_url?: string;
  old_message_id?: number;
  timestamp: string;
}

/**
 * Send to Telegram request
 */
export interface SendToTelegramRequest {
  channel: string;
  content: string;
  image_url?: string;
}

/**
 * Edit Telegram message request
 */
export interface EditTelegramMessageRequest {
  message_id: number;
  content: string;
  image_url?: string;
}
```

---

### Step 4: Domain Model Types

**קובץ ליצור:** `lib/types/models.ts`

**תוכן:**
```typescript
/**
 * Domain model types (business logic types)
 */

/**
 * Parsed recipe structure
 */
export interface ParsedRecipe {
  title: string;
  ingredients: ParsedIngredient[];
  instructions: string[];
  metadata: RecipeMetadata;
}

export interface ParsedIngredient {
  name: string;
  amount?: string;
  unit?: string;
  notes?: string;
}

export interface RecipeMetadata {
  cooking_time?: number;
  preparation_time?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  servings?: number;
  categories?: string[];
}

/**
 * Shopping list aggregated item
 */
export interface AggregatedShoppingListItem {
  ingredient_name: string;
  total_quantity: string;
  category?: string;
  sources: {
    recipe_id: number;
    recipe_title: string;
    quantity: string;
  }[];
}

/**
 * Menu statistics
 */
export interface MenuStatistics {
  total_recipes: number;
  total_meals: number;
  total_servings: number;
  dietary_types: Record<string, number>;
  categories: Record<string, number>;
  estimated_total_time: number;
}

/**
 * Recipe version comparison
 */
export interface RecipeVersionComparison {
  version_id: number;
  version_num: number;
  changes: {
    field: string;
    old_value: any;
    new_value: any;
  }[];
  created_at: Date;
  created_by?: string;
}

/**
 * Sync status
 */
export interface SyncStatus {
  is_syncing: boolean;
  last_sync?: Date;
  recipes_synced: number;
  menus_synced: number;
  places_synced: number;
  errors: SyncError[];
}

export interface SyncError {
  entity_type: 'recipe' | 'menu' | 'place';
  entity_id: number;
  error_message: string;
  timestamp: Date;
}
```

---

### Step 5: Shared Enums

**קובץ ליצור:** `lib/types/enums.ts`

**תוכן:**
```typescript
/**
 * Shared enums (in addition to Prisma enums)
 */

/**
 * Recipe status
 */
export enum RecipeStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DRAFT = 'draft'
}

/**
 * Sync status
 */
export enum SyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending',
  FAILED = 'failed',
  IN_PROGRESS = 'in_progress'
}

/**
 * Meal types
 */
export enum MealType {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner',
  SNACK = 'snack',
  DESSERT = 'dessert'
}

/**
 * Course types
 */
export enum CourseType {
  APPETIZER = 'appetizer',
  SALAD = 'salad',
  MAIN = 'main',
  SIDE = 'side',
  DESSERT = 'dessert',
  DRINK = 'drink'
}

/**
 * User role
 */
export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  GUEST = 'guest'
}

/**
 * Log levels (for Pino)
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}
```

---

### Step 6: Utility Types

**קובץ ליצור:** `lib/types/utils.ts`

**תוכן:**
```typescript
/**
 * Utility types (TypeScript helpers)
 */

/**
 * Make specified fields required
 */
export type WithRequired<T, K extends keyof T> = T & {
  [P in K]-?: T[P];
};

/**
 * Make specified fields optional
 */
export type WithOptional<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: T[P];
};

/**
 * Deep partial (recursive)
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Nullable fields
 */
export type Nullable<T> = T | null;

/**
 * Pick by value type
 */
export type PickByValueType<T, ValueType> = Pick<
  T,
  { [Key in keyof T]: T[Key] extends ValueType ? Key : never }[keyof T]
>;

/**
 * Async function type
 */
export type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;

/**
 * ID type (can be string or number)
 */
export type ID = string | number;

/**
 * Timestamp (ISO string or Date)
 */
export type Timestamp = string | Date;

/**
 * JSON value
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
```

---

### Step 7: Central Export (index.ts)

**קובץ ליצור:** `lib/types/index.ts`

**תוכן:**
```typescript
/**
 * Central types export
 * Import from: import { Recipe, ApiResponse } from '@/lib/types'
 */

// Database types
export * from './database';

// API types
export * from './api';

// Domain models
export * from './models';

// Enums
export * from './enums';

// Utilities
export * from './utils';

// Re-export commonly used Prisma types
export type { Prisma } from '@prisma/client';
```

---

### Step 8: Create Type Guards

**קובץ ליצור:** `lib/utils/type-guards.ts`

**תוכן:**
```typescript
/**
 * TypeScript type guards
 */
import { RecipeDifficulty, DietaryType } from '@prisma/client';

/**
 * Check if value is RecipeDifficulty
 */
export function isRecipeDifficulty(value: any): value is RecipeDifficulty {
  return (
    value === RecipeDifficulty.EASY ||
    value === RecipeDifficulty.MEDIUM ||
    value === RecipeDifficulty.HARD
  );
}

/**
 * Check if value is DietaryType
 */
export function isDietaryType(value: any): value is DietaryType {
  return (
    value === DietaryType.MEAT ||
    value === DietaryType.DAIRY ||
    value === DietaryType.PAREVE
  );
}

/**
 * Check if value is valid pagination
 */
export function isValidPagination(params: {
  page?: any;
  pageSize?: any;
}): params is { page: number; pageSize: number } {
  return (
    typeof params.page === 'number' &&
    typeof params.pageSize === 'number' &&
    params.page > 0 &&
    params.pageSize > 0 &&
    params.pageSize <= 100
  );
}

/**
 * Assert value is not null/undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] All type files created
- [x] Types organized by category
- [x] Central export (index.ts)
- [x] Type guards created

### Technical Requirements:
- [x] TypeScript compiles without errors
- [x] Autocomplete works in IDE
- [x] Types importable from `@/lib/types`
- [x] No circular dependencies

### Code Quality:
- [x] Types well-documented (JSDoc comments)
- [x] Logical organization
- [x] Reusable utility types

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: Import and Use Types**
```typescript
// Create test file: test-types.ts
import {
  Recipe,
  RecipeWithRelations,
  ApiResponse,
  CreateRecipeRequest,
  RecipeDifficulty
} from '@/lib/types';

// Test usage
const recipe: Recipe = {
  id: 1,
  telegram_id: 123,
  title: 'Test',
  raw_content: 'Test content',
  // ... TypeScript should autocomplete all fields
};

const response: ApiResponse<Recipe> = {
  data: recipe
};

// This should show autocomplete
const difficulty: RecipeDifficulty = RecipeDifficulty.EASY;
```

**Expected:**
- Full autocomplete
- No type errors
- IntelliSense shows all fields

**Test 2: Type Guards**
```typescript
import { isRecipeDifficulty, assertDefined } from '@/lib/utils/type-guards';

const value = 'EASY';
if (isRecipeDifficulty(value)) {
  // value is now typed as RecipeDifficulty
  console.log(value);
}

const nullableValue: string | null = null;
try {
  assertDefined(nullableValue);
} catch (error) {
  console.log('Correctly threw error');
}
```

**Test 3: Compilation**
```bash
npm run build
# Expected: No type errors
```

---

## 🔄 Rollback Strategy

**אם יש בעיות:**

```bash
# Remove types directory
rm -rf lib/types
rm -f lib/utils/type-guards.ts
```

**Zero risk**: אלו רק type definitions, לא runtime code.

---

## 📊 Estimated Time

- **Minimum**: 1.5 hours
- **Expected**: 2 hours
- **Maximum**: 3 hours

**Breakdown:**
- Database types: 30 min
- API types: 45 min
- Domain models: 30 min
- Enums & utils: 30 min
- Type guards: 15 min
- Testing: 15 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Prisma Types Priority:**
- Always prefer Prisma-generated types
- Only create custom types when needed (e.g., with relations)

**2. API Types:**
- Request types = what client sends
- Response types = what server returns
- Always wrap in `ApiResponse<T>`

**3. Type Guards:**
- Use for runtime validation
- Especially important for enum values
- TypeScript can't validate at runtime without guards

**4. Avoid Duplication:**
```typescript
// ❌ Bad - duplicates Prisma type
export interface Recipe {
  id: number;
  title: string;
  // ...
}

// ✅ Good - re-exports Prisma type
export type { Recipe } from '@prisma/client';
```

### Potential Issues:

**Issue 1**: Circular dependencies
- **Solution**: Keep database types separate from API types

**Issue 2**: Type inference not working
- **Solution**: Explicit type annotations, restart TS server

**Issue 3**: Prisma types not found
- **Solution**: Run `npx prisma generate`

### Best Practices:

1. **Document types**: Add JSDoc comments
2. **Use unions**: Instead of any, use union types
3. **Prefer interfaces** for objects (can be extended)
4. **Prefer types** for unions/intersections
5. **Export from index.ts**: One central import point

### References:
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Prisma Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [Type Guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)

---

## 🔗 Related Tasks

**Depends on:**
- TASK-1.3: Prisma Schema Creation (needs Prisma types)

**Blocks:**
- Phase 2: API Migration (will use these types)

**Can run in parallel with:**
- TASK-1.5: API Routes Structure
- TASK-1.7: Testing Infrastructure
- TASK-1.8: Logging Setup

---

## ✏️ AI Agent Instructions

**For Claude Code or similar AI agents:**

```
Task: Create comprehensive TypeScript types system

Context:
- Prisma schema already created (types generated)
- Need shared types for API, models, enums
- Frontend and backend will use same types
- Must be well-organized and documented

Your job:
1. Create lib/types/ directory structure
2. Create database.ts (Prisma-based types)
3. Create api.ts (request/response types)
4. Create models.ts (domain types)
5. Create enums.ts (shared enums)
6. Create utils.ts (utility types)
7. Create index.ts (central export)
8. Create lib/utils/type-guards.ts
9. Test compilation and autocomplete

Type categories:
- Database: Re-export Prisma, add relation types
- API: Request/Response wrappers, pagination
- Models: Business logic types (ParsedRecipe, etc.)
- Enums: Shared enums (beyond Prisma enums)
- Utils: TypeScript utility types

Constraints:
- Don't duplicate Prisma types
- Use TypeScript generics where appropriate
- Add JSDoc comments to all types
- Organize logically by domain
- No circular dependencies

Expected output:
- 7 type files created (including index.ts)
- Type guards created
- All imports work from @/lib/types
- TypeScript compilation passes
- Autocomplete works in IDE

Verification:
1. npm run build (should pass)
2. Import types in test file
3. Check autocomplete works
4. No type errors anywhere
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

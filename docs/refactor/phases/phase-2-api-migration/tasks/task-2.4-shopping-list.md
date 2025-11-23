# 📋 Task 2.4: Shopping List CRUD

**מזהה**: TASK-2.4
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 4-5 hours
**Priority**: 🟡 Medium (Important feature, not critical path)

---

## 🎯 Goal

להעביר את כל ה-Shopping List operations מ-Flask ל-Next.js - קריאה, יצירה, עדכון, ומחיקה של פריטים ברשימת קניות.

### Why This Task?
- **Useful feature** - רשימת קניות היא פיצ'ר חשוב לתפריטים
- **Pure CRUD** - אין תלויות חיצוניות (לא Telegram, לא AI)
- **Database only** - רק Prisma operations
- **Can run in parallel** - אין תלות במשימות אחרות

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.3: Prisma Schema (ShoppingListItem model ready)
- [x] TASK-1.4: Migration Script (data in PostgreSQL)
- [x] TASK-1.5: API Structure (utilities ready)
- [x] TASK-1.6: Types Setup (types ready)

**Nice to have:**
- [x] TASK-2.2: Menus Read APIs (for menu access control)
- [ ] TASK-1.7: Testing Setup (for writing tests)

---

## 📋 Endpoints to Migrate

### From `backend/ourRecipesBack/routes/menus.py`:

| Endpoint | Method | Flask Line | Description | Complexity |
|----------|--------|------------|-------------|------------|
| `/<menu_id>/shopping-list` | GET | ~472 | Get shopping list for menu | 🟢 Easy |
| `/<menu_id>/shopping-list/regenerate` | POST | ~505 | Regenerate from recipes | 🟡 Medium |
| `/shopping-list/items/<item_id>` | PATCH | ~536 | Update item (check/uncheck) | 🟢 Easy |

### Additional CRUD operations (to implement):

| Endpoint | Method | Description | Complexity |
|----------|--------|-------------|------------|
| `/shopping-list/items` | POST | Add custom item to list | 🟢 Easy |
| `/shopping-list/items/<item_id>` | PUT | Update item details | 🟢 Easy |
| `/shopping-list/items/<item_id>` | DELETE | Delete item from list | 🟢 Easy |

**Total**: ~6 main operations, ~200 lines Flask → ~350 lines Next.js

---

## 📋 Implementation Guide

### Step 1: Analyze Flask Implementation

**מה לעשות:**
- [x] קרא את `backend/ourRecipesBack/routes/menus.py` (shopping list endpoints)
- [x] קרא את `backend/ourRecipesBack/services/shopping_list_service.py`
- [x] הבן את הlogic של generate_shopping_list

**Flask Reference - GET shopping list (Line 472):**
```python
@menus_bp.route("/<int:menu_id>/shopping-list", methods=["GET"])
@jwt_required()
def get_shopping_list(menu_id):
    """Get shopping list for a menu"""
    try:
        user_id = get_jwt_identity()

        # Verify menu exists
        menu = Menu.query.get(menu_id)
        if not menu:
            return jsonify({"error": "Menu not found"}), 404

        # Check ownership or public access
        if menu.user_id != user_id and not menu.is_public:
            return jsonify({"error": "Access denied"}), 403

        shopping_list = ShoppingListService.get_shopping_list(menu_id)

        return jsonify({
            "shopping_list": shopping_list
        }), 200

    except Exception as e:
        return jsonify({"error": "Failed to get shopping list"}), 500
```

**Key points:**
- Access control: owner or public menu
- Returns grouped by category
- Includes item details: name, quantity, category, is_checked

---

### Step 2: Create Get Shopping List Endpoint

**קובץ ליצור:** `app/api/menus/[id]/shopping-list/route.ts`

**Implementation:**
```typescript
/**
 * GET /api/menus/:id/shopping-list
 * Get shopping list for a menu
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError
} from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const userId = session.user.id;
    const menuId = validateId(params.id);

    logger.debug({ userId, menuId }, 'Fetching shopping list');

    // Verify menu exists and user has access
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: {
        id: true,
        user_id: true,
        is_public: true
      }
    });

    if (!menu) {
      throw NotFoundError('Menu not found');
    }

    // Check access: owner or public
    if (menu.user_id !== userId && !menu.is_public) {
      throw ForbiddenError('Access denied');
    }

    // Get shopping list items
    const items = await prisma.shoppingListItem.findMany({
      where: { menu_id: menuId },
      orderBy: [
        { category: 'asc' },
        { ingredient_name: 'asc' }
      ]
    });

    // Group by category
    const groupedByCategory: Record<string, any[]> = {};
    items.forEach(item => {
      const category = item.category || 'אחר';
      if (!groupedByCategory[category]) {
        groupedByCategory[category] = [];
      }
      groupedByCategory[category].push({
        id: item.id,
        ingredient_name: item.ingredient_name,
        quantity: item.quantity,
        is_checked: item.is_checked,
        notes: item.notes
      });
    });

    logger.info(
      { menuId, totalItems: items.length, categories: Object.keys(groupedByCategory).length },
      'Shopping list fetched'
    );

    return successResponse(groupedByCategory);
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

### Step 3: Create Regenerate Shopping List Endpoint

**קובץ ליצור:** `app/api/menus/[id]/shopping-list/regenerate/route.ts`

**Implementation:**
```typescript
/**
 * POST /api/menus/:id/shopping-list/regenerate
 * Regenerate shopping list from menu's recipes
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError
} from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';
import { generateShoppingList } from '@/lib/services/shoppingListService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const userId = session.user.id;
    const menuId = validateId(params.id);

    logger.debug({ userId, menuId }, 'Regenerating shopping list');

    // Verify menu exists and user is owner
    const menu = await prisma.menu.findUnique({
      where: { id: menuId },
      select: {
        id: true,
        user_id: true
      }
    });

    if (!menu) {
      throw NotFoundError('Menu not found');
    }

    // Only owner can regenerate (not public access)
    if (menu.user_id !== userId) {
      throw ForbiddenError('Access denied');
    }

    // Delete existing shopping list
    await prisma.shoppingListItem.deleteMany({
      where: { menu_id: menuId }
    });

    // Generate new shopping list from recipes
    const shoppingList = await generateShoppingList(menuId);

    logger.info(
      { menuId, itemsCreated: Object.values(shoppingList).flat().length },
      'Shopping list regenerated'
    );

    return successResponse(shoppingList);
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

### Step 4: Create Update Item Endpoint

**קובץ ליצור:** `app/api/shopping-list/items/[id]/route.ts`

**Implementation:**
```typescript
/**
 * PATCH /api/shopping-list/items/:id
 * Update shopping list item (check/uncheck)
 *
 * PUT /api/shopping-list/items/:id
 * Update full item details
 *
 * DELETE /api/shopping-list/items/:id
 * Delete item from shopping list
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError
} from '@/lib/utils/api-errors';
import { validateId } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const userId = session.user.id;
    const itemId = validateId(params.id);
    const body = await request.json();

    if (typeof body.is_checked !== 'boolean') {
      throw BadRequestError('is_checked is required and must be boolean');
    }

    logger.debug({ userId, itemId, is_checked: body.is_checked }, 'Updating item status');

    // Get item with menu ownership check
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId },
      include: {
        menu: {
          select: {
            user_id: true
          }
        }
      }
    });

    if (!item) {
      throw NotFoundError('Item not found');
    }

    // Only menu owner can update
    if (item.menu.user_id !== userId) {
      throw ForbiddenError('Access denied');
    }

    // Update item
    const updatedItem = await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: {
        is_checked: body.is_checked
      }
    });

    logger.info({ itemId, is_checked: body.is_checked }, 'Item status updated');

    return successResponse(updatedItem);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const userId = session.user.id;
    const itemId = validateId(params.id);
    const body = await request.json();

    logger.debug({ userId, itemId }, 'Updating item details');

    // Get item with menu ownership check
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId },
      include: {
        menu: {
          select: {
            user_id: true
          }
        }
      }
    });

    if (!item) {
      throw NotFoundError('Item not found');
    }

    if (item.menu.user_id !== userId) {
      throw ForbiddenError('Access denied');
    }

    // Update item
    const updatedItem = await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: {
        ingredient_name: body.ingredient_name || item.ingredient_name,
        quantity: body.quantity !== undefined ? body.quantity : item.quantity,
        category: body.category !== undefined ? body.category : item.category,
        notes: body.notes !== undefined ? body.notes : item.notes,
        is_checked: body.is_checked !== undefined ? body.is_checked : item.is_checked
      }
    });

    logger.info({ itemId }, 'Item updated');

    return successResponse(updatedItem);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const userId = session.user.id;
    const itemId = validateId(params.id);

    logger.debug({ userId, itemId }, 'Deleting item');

    // Get item with menu ownership check
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId },
      include: {
        menu: {
          select: {
            user_id: true
          }
        }
      }
    });

    if (!item) {
      throw NotFoundError('Item not found');
    }

    if (item.menu.user_id !== userId) {
      throw ForbiddenError('Access denied');
    }

    // Delete item
    await prisma.shoppingListItem.delete({
      where: { id: itemId }
    });

    logger.info({ itemId }, 'Item deleted');

    return successResponse({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

### Step 5: Create Shopping List Service

**קובץ ליצור:** `lib/services/shoppingListService.ts`

**Implementation:**
```typescript
/**
 * Shopping List Service
 * Generates shopping list from menu's recipes
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface IngredientGroup {
  [category: string]: {
    id?: number;
    ingredient_name: string;
    quantity: string | null;
    is_checked: boolean;
    notes: string | null;
  }[];
}

/**
 * Generate shopping list from menu's recipes
 */
export async function generateShoppingList(menuId: number): Promise<IngredientGroup> {
  logger.debug({ menuId }, 'Generating shopping list');

  // Get menu with all recipes
  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
    include: {
      meals: {
        include: {
          recipes: {
            include: {
              recipe: {
                select: {
                  id: true,
                  ingredients_list: true,
                  ingredients: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!menu) {
    throw new Error('Menu not found');
  }

  // Extract all ingredients from recipes
  const ingredientsMap = new Map<string, { quantity: string | null; category: string }>();

  menu.meals.forEach(meal => {
    meal.recipes.forEach(mealRecipe => {
      const recipe = mealRecipe.recipe;

      // Use parsed ingredients_list if available
      if (recipe.ingredients_list && Array.isArray(recipe.ingredients_list)) {
        recipe.ingredients_list.forEach((ing: any) => {
          const name = ing.name || ing.ingredient;
          const quantity = ing.quantity || ing.amount || null;
          const category = ing.category || categorizeIngredient(name);

          if (ingredientsMap.has(name)) {
            // Combine quantities (simplified - in reality would need smart combining)
            const existing = ingredientsMap.get(name)!;
            ingredientsMap.set(name, {
              quantity: combineQuantities(existing.quantity, quantity),
              category: existing.category
            });
          } else {
            ingredientsMap.set(name, { quantity, category });
          }
        });
      } else if (recipe.ingredients) {
        // Fallback: parse raw ingredients string
        const lines = recipe.ingredients.split('||').filter(Boolean);
        lines.forEach(line => {
          const name = line.trim();
          if (name) {
            ingredientsMap.set(name, {
              quantity: null,
              category: categorizeIngredient(name)
            });
          }
        });
      }
    });
  });

  // Create shopping list items in DB
  const itemsToCreate = Array.from(ingredientsMap.entries()).map(([name, data]) => ({
    menu_id: menuId,
    ingredient_name: name,
    quantity: data.quantity,
    category: data.category,
    is_checked: false,
    notes: null
  }));

  await prisma.shoppingListItem.createMany({
    data: itemsToCreate
  });

  // Get created items and group by category
  const items = await prisma.shoppingListItem.findMany({
    where: { menu_id: menuId },
    orderBy: [
      { category: 'asc' },
      { ingredient_name: 'asc' }
    ]
  });

  const groupedByCategory: IngredientGroup = {};
  items.forEach(item => {
    const category = item.category || 'אחר';
    if (!groupedByCategory[category]) {
      groupedByCategory[category] = [];
    }
    groupedByCategory[category].push({
      id: item.id,
      ingredient_name: item.ingredient_name,
      quantity: item.quantity,
      is_checked: item.is_checked,
      notes: item.notes
    });
  });

  logger.info(
    { menuId, totalItems: items.length, categories: Object.keys(groupedByCategory).length },
    'Shopping list generated'
  );

  return groupedByCategory;
}

/**
 * Categorize ingredient based on name (simple heuristic)
 */
function categorizeIngredient(name: string): string {
  const lowerName = name.toLowerCase();

  // Vegetables
  if (/עגבני|מלפפון|פלפל|בצל|שום|גזר|תפוח אדמה|בטטה|דלעת|חציל|זוקיני|ברוקולי|כרוב|חסה/.test(lowerName)) {
    return 'ירקות';
  }

  // Fruits
  if (/תפוח|בננה|תפוז|לימון|אבטיח|מלון|אגס|אפרסק|שזיף|תות/.test(lowerName)) {
    return 'פירות';
  }

  // Meat & Protein
  if (/עוף|בשר|דג|טונה|סלמון|סטייק|שניצל|קציצה|נקניק|נתח|חזה/.test(lowerName)) {
    return 'בשר ודגים';
  }

  // Dairy
  if (/חלב|גבינ|יוגורט|שמנת|חמאה|קוטג|צהובה|לבנה|מוצרלה/.test(lowerName)) {
    return 'מוצרי חלב';
  }

  // Grains & Bread
  if (/לחם|פיתה|חלה|פסטה|אורז|בורגול|קוסקוס|קמח|קוואקר/.test(lowerName)) {
    return 'דגנים ולחמים';
  }

  // Spices & Condiments
  if (/מלח|פלפל|כמון|פפריקה|כורכום|קינמון|סוכר|תבלין|רוטב|קטשופ|מיונז|חומץ|שמן/.test(lowerName)) {
    return 'תבלינים ורטבים';
  }

  // Default
  return 'אחר';
}

/**
 * Combine quantities (simplified)
 */
function combineQuantities(qty1: string | null, qty2: string | null): string | null {
  if (!qty1) return qty2;
  if (!qty2) return qty1;

  // If both have numbers, try to add them
  const num1 = parseFloat(qty1);
  const num2 = parseFloat(qty2);

  if (!isNaN(num1) && !isNaN(num2)) {
    // Extract units
    const unit1 = qty1.replace(/[\d\s.]/g, '').trim();
    const unit2 = qty2.replace(/[\d\s.]/g, '').trim();

    if (unit1 === unit2) {
      return `${num1 + num2} ${unit1}`;
    }
  }

  // Fallback: concatenate
  return `${qty1} + ${qty2}`;
}
```

---

### Step 6: Create Tests

**קובץ ליצור:** `tests/integration/api/shopping-list.test.ts`

(Tests implementation - similar structure to previous tests)

---

## ✅ Success Criteria

### Functional Requirements:
- [x] Get shopping list works
- [x] Regenerate creates new list from recipes
- [x] Update item status (check/uncheck) works
- [x] Update item details works
- [x] Delete item works
- [x] Access control enforced
- [x] Shopping list grouped by category

### Technical Requirements:
- [x] Tests pass
- [x] Type-safe with Prisma
- [x] Auth with NextAuth
- [x] Logging in place
- [x] Error handling works

### Performance:
- [x] Response time < 100ms (get)
- [x] Response time < 500ms (regenerate)

---

## 📊 Estimated Time

- **Minimum**: 3 hours
- **Expected**: 4 hours
- **Maximum**: 5 hours

---

## 🔗 Related Tasks

**Depends on:**
- TASK-2.2: Menus Read APIs (for menu access control)

**Blocks:**
- None

**Can run in parallel with:**
- TASK-2.1, 2.3, 2.5, 2.6, 2.7

---

## ✏️ AI Agent Instructions

```
Task: Migrate Shopping List CRUD from Flask to Next.js

Context:
- Flask endpoints in backend/ourRecipesBack/routes/menus.py
- Shopping list service in backend/ourRecipesBack/services/shopping_list_service.py
- Migrate all shopping list operations

Your job:
1. Create app/api/menus/[id]/shopping-list/route.ts (GET)
2. Create app/api/menus/[id]/shopping-list/regenerate/route.ts (POST)
3. Create app/api/shopping-list/items/[id]/route.ts (PATCH, PUT, DELETE)
4. Create lib/services/shoppingListService.ts
5. Write integration tests

Access Control:
- GET: Owner or public menu
- Regenerate: Owner only
- Update/Delete items: Owner only

Shopping List Generation:
- Extract ingredients from all recipes in menu
- Categorize ingredients (ירקות, פירות, etc.)
- Combine duplicate ingredients
- Group by category
- Store in ShoppingListItem table

Expected output:
- 3 route files + service file
- Tests passing
- Categorization works
- Regenerate creates correct items
```

---

**Created**: 2025-11-22
**Priority**: 🟡 MEDIUM

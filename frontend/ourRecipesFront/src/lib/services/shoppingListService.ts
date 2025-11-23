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
        (recipe.ingredients_list as any[]).forEach((ing: any) => {
          const name = ing.name || ing.ingredient;
          if (!name) return;

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
            if (!ingredientsMap.has(name)) {
              ingredientsMap.set(name, {
                quantity: null,
                category: categorizeIngredient(name)
              });
            }
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

  if (itemsToCreate.length > 0) {
    await prisma.shoppingListItem.createMany({
      data: itemsToCreate
    });
  }

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

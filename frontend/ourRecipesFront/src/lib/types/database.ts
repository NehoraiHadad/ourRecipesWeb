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
  SyncQueue,
  RecipeDifficulty,
  DietaryType,
  RecipeStatus,
  SyncStatus,
  QueueStatus,
  QueueActionType,
  CourseType
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

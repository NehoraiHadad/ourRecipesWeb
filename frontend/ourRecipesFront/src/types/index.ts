export type Difficulty = "easy" | "medium" | "hard";

export type DietaryType = "meat" | "dairy" | "pareve";

export type CourseType = "appetizer" | "main" | "side" | "dessert" | "salad" | "soup";

export interface RecipeSummary {
  id: number;
  /** The key `GET /api/recipes/:telegram_id` looks up by — use it to open the recipe. */
  telegram_id?: number;
  title: string;
  categories?: string;
  difficulty?: Difficulty;
  cooking_time?: number;
  preparation_time?: number;
  servings?: number;
  image_url?: string;
}

/**
 * One course inside a meal: which recipe, where it sits, and why the planner
 * chose it. A saved course (`MealRecipe`) and an unsaved AI-preview course are
 * the same thing at different points in its life, so both carry this shape —
 * including the embedded `recipe` summary. Without that summary the UI can
 * only show a bare id, which is what made every previewed course render as
 * "מתכון לא זמין".
 */
export interface PlannedCourse {
  recipe_id: number;
  course_type?: string;
  course_order: number;
  ai_reason?: string;
  recipe?: RecipeSummary;
}

export interface MealRecipe extends PlannedCourse {
  id: number;
  menu_meal_id: number;
  servings?: number;
  notes?: string;
  created_at: string;
}

export interface MenuPreviewMeal {
  meal_type: string;
  meal_order: number;
  meal_time?: string;
  recipes: PlannedCourse[];
}

/**
 * An AI menu before it is saved. Deliberately the same tree a saved `Menu`
 * renders (meals → courses → recipe summary), and it uses the saved menu's
 * field name `ai_reasoning` — the two shapes drifting apart is exactly how
 * preview rendering broke once already.
 */
export interface MenuPreview {
  meals: MenuPreviewMeal[];
  ai_reasoning?: string;
}

export interface MenuMeal {
  id: number;
  menu_id: number;
  meal_type: string;
  meal_order: number;
  meal_time?: string;
  notes?: string;
  created_at: string;
  recipes: MealRecipe[];
}

export interface Menu {
  id: number;
  user_id: string;
  name: string;
  event_type?: string;
  description?: string;
  total_servings: number;
  dietary_type?: DietaryType;
  is_public: boolean;
  share_token: string;
  ai_reasoning?: string;
  created_at: string;
  updated_at?: string;
  meals?: MenuMeal[];
}

export interface MenuGenerationRequest {
  name: string;
  event_type: string;
  servings: number;
  dietary_type?: DietaryType;
  meal_types: string[];
  special_requests?: string;
  description?: string;
}

export interface ShoppingListItem {
  id: number;
  menu_id: number;
  ingredient_name: string;
  quantity: string;
  category: string;
  is_checked: boolean;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface ShoppingList {
  [category: string]: ShoppingListItem[];
}

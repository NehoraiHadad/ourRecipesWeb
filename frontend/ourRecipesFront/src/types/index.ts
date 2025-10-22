export type Difficulty = "easy" | "medium" | "hard";

export interface recipe {
  id: number;
  telegram_id: number;
  title: string;
  raw_content: string;
  details: string;
  categories: string[];
  difficulty?: Difficulty;
  preparation_time?: number;
  ingredients?: string[];
  instructions?: string[] | string;
  is_parsed: boolean;
  parse_errors: string | null;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  image?: string;
}

export interface RecipeVersion {
  id: number;
  recipe_id: number;
  content: {
    title: string;
    raw_content: string;
    categories?: string[];
    ingredients?: string[];
    instructions?: string;
  };
  created_at: string;
  created_by: string;
  change_description?: string;
  is_current: boolean;
  image?: string | null;
}

export type DietaryType = "meat" | "dairy" | "pareve";

export type CourseType = "appetizer" | "main" | "side" | "dessert" | "salad" | "soup";

export interface RecipeSummary {
  id: number;
  title: string;
  categories?: string;
  difficulty?: Difficulty;
  cooking_time?: number;
  preparation_time?: number;
  servings?: number;
  image_url?: string;
}

export interface MealRecipe {
  id: number;
  menu_meal_id: number;
  recipe_id: number;
  course_type?: string;
  course_order: number;
  servings?: number;
  notes?: string;
  ai_reason?: string;
  created_at: string;
  recipe?: RecipeSummary;
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

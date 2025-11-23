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

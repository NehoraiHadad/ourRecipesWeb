import { apiService } from './apiService';
import type {
  Menu,
  MenuGenerationRequest,
  ShoppingList,
  RecipeSummary,
  MealRecipe,
} from '../types';

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  menu?: Menu;
  menus?: Menu[];
  shopping_list?: ShoppingList;
  suggestions?: RecipeSummary[];
  meal_recipe?: MealRecipe;
  item?: any;
  preview?: any;  // For menu preview
  preferences?: any;  // For menu preview preferences echo
  error?: string;
  message?: string;
}

export class MenuService {
  private static readonly BASE_PATH = '/api/menus';
  private static readonly SHOPPING_LIST_ITEMS_PATH = '/api/shopping-list/items';

  /**
   * Generate menu PREVIEW using AI (without saving to database)
   * User can review before confirming
   * Note: This can take 30-90 seconds due to AI processing
   */
  static async generateMenuPreview(request: MenuGenerationRequest): Promise<ApiResponse<{
    preview: any;
    preferences: MenuGenerationRequest;
  }>> {
    // `POST /api/menus/generate-preview` answers `{ data: { preview, preferences } }`.
    const response = await apiService.post<{
      data: { preview: any; preferences: MenuGenerationRequest };
    }>(`${this.BASE_PATH}/generate-preview`, request, {
      timeout: 120000 // 2 minutes timeout for AI menu generation
    });
    return { ...response?.data };
  }

  /**
   * Save menu to database after user confirms the preview
   */
  static async saveMenu(preview: any, preferences: MenuGenerationRequest): Promise<ApiResponse<{
    menu: Menu;
    shopping_list: ShoppingList;
  }>> {
    // Flask's `POST /menus/save` became `POST /api/menus`; the flat
    // `{ success, menu, shopping_list }` body is unchanged.
    return apiService.post<ApiResponse<{
      menu: Menu;
      shopping_list: ShoppingList;
    }>>(this.BASE_PATH, {
      preview,
      preferences
    }, { timeout: 60000 });
  }

  /**
   * Get all menus for the current user
   */
  static async getUserMenus(): Promise<ApiResponse<Menu[]>> {
    // `GET /api/menus` answers `{ data, pagination }`, and unlike the single
    // menu route it serves raw rows — `dietary_type` still carries the Prisma
    // enum casing, which the UI's label map expects in lower case.
    const response = await apiService.get<{ data: Menu[] }>(this.BASE_PATH);
    const menus = (response?.data ?? []).map((menu) => ({
      ...menu,
      dietary_type: menu.dietary_type
        ? (String(menu.dietary_type).toLowerCase() as Menu['dietary_type'])
        : menu.dietary_type
    }));
    return { menus };
  }

  /**
   * Get a specific menu by ID
   */
  static async getMenu(menuId: number): Promise<ApiResponse<Menu>> {
    // `GET /api/menus/:id` answers `{ data: menu }`.
    const response = await apiService.get<{ data: Menu }>(`${this.BASE_PATH}/${menuId}`);
    return { menu: response?.data };
  }

  /**
   * Get a shared menu by token (no auth required)
   */
  static async getSharedMenu(shareToken: string): Promise<ApiResponse<Menu>> {
    // `GET /api/menus/shared/:token` answers `{ data: menu }`.
    const response = await apiService.get<{ data: Menu }>(`${this.BASE_PATH}/shared/${shareToken}`);
    return { menu: response?.data };
  }

  /**
   * Update menu details
   */
  static async updateMenu(
    menuId: number,
    data: Partial<Pick<Menu, 'name' | 'description' | 'is_public'>>
  ): Promise<ApiResponse<Menu>> {
    return apiService.put<ApiResponse<Menu>>(`${this.BASE_PATH}/${menuId}`, data);
  }

  /**
   * Delete a menu
   */
  static async deleteMenu(menuId: number): Promise<ApiResponse<{ message: string }>> {
    return apiService.delete<ApiResponse<{ message: string }>>(`${this.BASE_PATH}/${menuId}`);
  }

  /**
   * Replace a recipe in a meal
   */
  static async replaceRecipe(
    menuId: number,
    mealId: number,
    recipeId: number,
    newRecipeId: number
  ): Promise<ApiResponse<{
    meal_recipe: MealRecipe;
    shopping_list: ShoppingList;
  }>> {
    return apiService.put<ApiResponse<{
      meal_recipe: MealRecipe;
      shopping_list: ShoppingList;
    }>>(`${this.BASE_PATH}/${menuId}/meals/${mealId}/recipes/${recipeId}`, {
      new_recipe_id: newRecipeId
    });
  }

  /**
   * Get recipe replacement suggestions
   */
  static async getRecipeSuggestions(
    menuId: number,
    mealId: number,
    recipeId: number
  ): Promise<ApiResponse<RecipeSummary[]>> {
    return apiService.get<ApiResponse<RecipeSummary[]>>(
      `${this.BASE_PATH}/${menuId}/meals/${mealId}/recipes/${recipeId}/suggestions`
    );
  }

  /**
   * Get shopping list for a menu
   */
  static async getShoppingList(menuId: number): Promise<ApiResponse<ShoppingList>> {
    // `GET /api/menus/:id/shopping-list` answers `{ data: <grouped list> }`.
    const response = await apiService.get<{ data: ShoppingList }>(
      `${this.BASE_PATH}/${menuId}/shopping-list`
    );
    return { shopping_list: response?.data };
  }

  /**
   * Regenerate shopping list for a menu
   */
  static async regenerateShoppingList(menuId: number): Promise<ApiResponse<ShoppingList>> {
    // `POST /api/menus/:id/shopping-list/regenerate` answers `{ data: <grouped list> }`.
    const response = await apiService.post<{ data: ShoppingList }>(
      `${this.BASE_PATH}/${menuId}/shopping-list/regenerate`,
      undefined,
      { timeout: 60000 }
    );
    return { shopping_list: response?.data };
  }

  /**
   * Update shopping list item status
   */
  static async updateShoppingItemStatus(
    itemId: number,
    isChecked: boolean
  ): Promise<ApiResponse<any>> {
    // Standalone route, not nested under `/menus`.
    return apiService.patch<ApiResponse<any>>(
      `${this.SHOPPING_LIST_ITEMS_PATH}/${itemId}`,
      { is_checked: isChecked }
    );
  }

  /**
   * Generate share link for a menu
   */
  static getShareLink(shareToken: string): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/menus/shared/${shareToken}`;
  }

  /**
   * Copy share link to clipboard
   */
  static async copyShareLink(shareToken: string): Promise<boolean> {
    try {
      const link = this.getShareLink(shareToken);
      await navigator.clipboard.writeText(link);
      return true;
    } catch (error) {
      console.error('Failed to copy share link:', error);
      return false;
    }
  }

  /**
   * Delete a recipe from a meal
   */
  static async deleteRecipeFromMeal(
    menuId: number,
    mealId: number,
    recipeId: number
  ): Promise<ApiResponse<{
    message: string;
    shopping_list: ShoppingList;
  }>> {
    return apiService.delete<ApiResponse<{
      message: string;
      shopping_list: ShoppingList;
    }>>(`${this.BASE_PATH}/${menuId}/meals/${mealId}/recipes/${recipeId}`);
  }

  /**
   * Add a recipe to a meal
   */
  static async addRecipeToMeal(
    menuId: number,
    mealId: number,
    recipeId: number,
    courseType?: string,
    courseOrder?: number
  ): Promise<ApiResponse<{
    meal_recipe: MealRecipe;
    shopping_list: ShoppingList;
  }>> {
    return apiService.post<ApiResponse<{
      meal_recipe: MealRecipe;
      shopping_list: ShoppingList;
    }>>(`${this.BASE_PATH}/${menuId}/meals/${mealId}/recipes`, {
      recipe_id: recipeId,
      course_type: courseType,
      course_order: courseOrder
    });
  }

  /**
   * Delete a meal from a menu
   */
  static async deleteMeal(
    menuId: number,
    mealId: number
  ): Promise<ApiResponse<{
    message: string;
    shopping_list: ShoppingList;
  }>> {
    return apiService.delete<ApiResponse<{
      message: string;
      shopping_list: ShoppingList;
    }>>(`${this.BASE_PATH}/${menuId}/meals/${mealId}`);
  }

  /**
   * Add a new meal to a menu
   */
  static async addMealToMenu(
    menuId: number,
    mealType: string,
    mealTime?: string,
    mealOrder?: number
  ): Promise<ApiResponse<any>> {
    return apiService.post<ApiResponse<any>>(`${this.BASE_PATH}/${menuId}/meals`, {
      meal_type: mealType,
      meal_time: mealTime,
      meal_order: mealOrder
    });
  }
}

// Export singleton instance
export const menuService = MenuService;

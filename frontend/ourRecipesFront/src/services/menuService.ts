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
  error?: string;
  message?: string;
}

export class MenuService {
  private static readonly BASE_PATH = '/menus';

  /**
   * Generate menu PREVIEW using AI (without saving to database)
   * User can review before confirming
   * Note: This can take 30-90 seconds due to AI processing
   */
  static async generateMenuPreview(request: MenuGenerationRequest): Promise<ApiResponse<{
    preview: any;
    preferences: MenuGenerationRequest;
  }>> {
    return apiService.post<ApiResponse<{
      preview: any;
      preferences: MenuGenerationRequest;
    }>>(`${this.BASE_PATH}/generate-preview`, request, {
      timeout: 120000 // 2 minutes timeout for AI menu generation
    });
  }

  /**
   * Save menu to database after user confirms the preview
   */
  static async saveMenu(preview: any, preferences: MenuGenerationRequest): Promise<ApiResponse<{
    menu: Menu;
    shopping_list: ShoppingList;
  }>> {
    return apiService.post<ApiResponse<{
      menu: Menu;
      shopping_list: ShoppingList;
    }>>(`${this.BASE_PATH}/save`, {
      preview,
      preferences
    });
  }

  /**
   * Get all menus for the current user
   */
  static async getUserMenus(): Promise<ApiResponse<Menu[]>> {
    return apiService.get<ApiResponse<Menu[]>>(this.BASE_PATH);
  }

  /**
   * Get a specific menu by ID
   */
  static async getMenu(menuId: number): Promise<ApiResponse<Menu>> {
    return apiService.get<ApiResponse<Menu>>(`${this.BASE_PATH}/${menuId}`);
  }

  /**
   * Get a shared menu by token (no auth required)
   */
  static async getSharedMenu(shareToken: string): Promise<ApiResponse<Menu>> {
    return apiService.get<ApiResponse<Menu>>(`${this.BASE_PATH}/shared/${shareToken}`);
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
    return apiService.get<ApiResponse<ShoppingList>>(`${this.BASE_PATH}/${menuId}/shopping-list`);
  }

  /**
   * Regenerate shopping list for a menu
   */
  static async regenerateShoppingList(menuId: number): Promise<ApiResponse<ShoppingList>> {
    return apiService.post<ApiResponse<ShoppingList>>(
      `${this.BASE_PATH}/${menuId}/shopping-list/regenerate`
    );
  }

  /**
   * Update shopping list item status
   */
  static async updateShoppingItemStatus(
    itemId: number,
    isChecked: boolean
  ): Promise<ApiResponse<any>> {
    return apiService.patch<ApiResponse<any>>(
      `${this.BASE_PATH}/shopping-list/items/${itemId}`,
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
}

// Export singleton instance
export const menuService = MenuService;

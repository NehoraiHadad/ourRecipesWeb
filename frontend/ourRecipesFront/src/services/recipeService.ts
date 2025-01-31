import { apiService } from './apiService';
import type { ApiResponse, SearchParams } from '../types/api';
import type { recipe as Recipe, RecipeVersion } from '../types/index';

interface UpdateRecipeData {
  newText: string;
  image?: string;
}

export class RecipeService {
  private static readonly BASE_PATH = '/recipes';

  // Get all recipes
  static async getRecipes(): Promise<ApiResponse<Recipe[]>> {
    return apiService.get<ApiResponse<Recipe[]>>(this.BASE_PATH);
  }

  // Get a single recipe by ID
  static async getRecipeById(id: number): Promise<ApiResponse<Recipe>> {
    return apiService.get<ApiResponse<Recipe>>(`${this.BASE_PATH}/${id}`);
  }

  // Search recipes
  static async searchRecipes(params: SearchParams): Promise<ApiResponse<Recipe[]>> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach(v => queryParams.append(key, v.toString()));
        } else {
          queryParams.append(key, value.toString());
        }
      }
    });
    return apiService.get<ApiResponse<Recipe[]>>(`${this.BASE_PATH}/search?${queryParams.toString()}`);
  }

  // Update recipe
  static async updateRecipe(telegramId: number, data: UpdateRecipeData): Promise<ApiResponse<Recipe>> {
    return apiService.put<ApiResponse<Recipe>>(`${this.BASE_PATH}/update/${telegramId}`, data);
  }

  // Get recipe versions
  static async getRecipeVersions(recipeId: number): Promise<ApiResponse<RecipeVersion[]>> {
    return apiService.get<ApiResponse<RecipeVersion[]>>(`${this.BASE_PATH}/${recipeId}/versions`);
  }

  // Parse recipe
  static async parseRecipe(recipeId: number): Promise<ApiResponse<Recipe>> {
    return apiService.post<ApiResponse<Recipe>>(`${this.BASE_PATH}/${recipeId}/parse`);
  }

  // Bulk parse recipes
  static async bulkParseRecipes(recipeIds: number[]): Promise<ApiResponse<Recipe[]>> {
    return apiService.post<ApiResponse<Recipe[]>>(`${this.BASE_PATH}/bulk-parse`, { recipeIds });
  }

  // Get search suggestions
  static async getSearchSuggestions(query: string): Promise<ApiResponse<string[]>> {
    return apiService.get<ApiResponse<string[]>>(`${this.BASE_PATH}/search/suggestions?q=${encodeURIComponent(query)}`);
  }
}

export const recipeService = new RecipeService(); 
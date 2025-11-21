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

  // Get a single recipe by ID with retry logic for sleeping servers
  // Uses longer timeout (90s) and retries up to 2 times with exponential backoff
  static async getRecipeByIdWithRetry(
    id: number,
    onRetry?: (attempt: number, maxAttempts: number) => void
  ): Promise<ApiResponse<Recipe>> {
    const maxAttempts = 3;
    const timeout = 90000; // 90 seconds - enough time for server to wake up

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await apiService.get<ApiResponse<Recipe>>(
          `${this.BASE_PATH}/${id}`,
          { timeout }
        );
      } catch (error: any) {
        const isLastAttempt = attempt === maxAttempts;
        const isTimeoutOrNetwork =
          error.name === 'TimeoutError' ||
          error.name === 'NetworkError' ||
          error.status === 408 ||
          error.status === 503 ||
          error.status === 504;

        // Only retry on timeout/network errors, not on 404s
        if (!isLastAttempt && isTimeoutOrNetwork) {
          if (onRetry) {
            onRetry(attempt, maxAttempts);
          }
          // Exponential backoff: 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Last attempt or non-retryable error - throw it
        throw error;
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error('Unexpected error in retry logic');
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
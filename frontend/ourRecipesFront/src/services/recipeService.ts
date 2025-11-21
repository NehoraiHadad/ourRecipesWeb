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
  // First attempt: 60s (wake up server), then 3x20s attempts (server should be awake)
  // Total max time: 60 + 20 + 20 + 20 = 120 seconds (2 minutes)
  static async getRecipeByIdWithRetry(
    id: number,
    onRetry?: (attempt: number, maxAttempts: number) => void
  ): Promise<ApiResponse<Recipe>> {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // First attempt: 60s to wake up the server
      // Subsequent attempts: 20s (server should already be awake)
      const timeout = attempt === 1 ? 60000 : 20000;

      try {
        console.log(`🔄 ניסיון ${attempt}/${maxAttempts} לטעינת מתכון ${id} (timeout: ${timeout/1000}s)`);
        const result = await apiService.get<ApiResponse<Recipe>>(
          `${this.BASE_PATH}/${id}`,
          { timeout }
        );
        console.log(`✅ מתכון ${id} נטען בהצלחה בניסיון ${attempt}`, result);
        return result;
      } catch (error: any) {
        const isLastAttempt = attempt === maxAttempts;

        // Log detailed error information
        console.error(`❌ ניסיון ${attempt}/${maxAttempts} נכשל עבור מתכון ${id}:`, {
          errorName: error?.name,
          errorStatus: error?.status,
          errorMessage: error?.message,
          fullError: error
        });

        // Check if this is a retryable error (server sleeping/waking up)
        const isTimeoutOrNetwork =
          error.name === 'TimeoutError' ||
          error.name === 'NetworkError' ||
          error.name === 'ApiError' && (
            error.status === 408 ||  // Request Timeout
            error.status === 502 ||  // Bad Gateway (server waking up)
            error.status === 503 ||  // Service Unavailable
            error.status === 504     // Gateway Timeout
          );

        // Only retry on timeout/network errors, not on 404s or other client errors
        if (!isLastAttempt && isTimeoutOrNetwork) {
          console.log(`🔁 ניסיון שוב בעוד ${Math.pow(2, attempt)} שניות...`);
          if (onRetry) {
            onRetry(attempt, maxAttempts);
          }
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Last attempt or non-retryable error - throw it
        console.error(`🛑 נכשל לטעון מתכון ${id} אחרי ${attempt} ניסיונות`);
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
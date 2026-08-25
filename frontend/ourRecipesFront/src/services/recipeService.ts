import { apiService } from './apiService';
import { toUiRecipe, type RawRecipeRow } from './recipeMapper';
import type { ApiResponse } from '../types/api';
import type { recipe as Recipe } from '../types/index';

interface UpdateRecipeData {
  newText: string;
  image?: string | null;
}

interface CreateRecipeData {
  newText: string;
  image?: string | null;
}

/** Writes mirror to Telegram and may upload an image — slower than a plain read. */
const WRITE_TIMEOUT = 60000;

export class RecipeService {
  private static readonly BASE_PATH = '/api/recipes';

  // Get a single recipe by its telegram_id
  static async getRecipeById(id: number): Promise<ApiResponse<Recipe>> {
    const response = await apiService.get<ApiResponse<RawRecipeRow>>(`${this.BASE_PATH}/${id}`);
    return { ...response, data: toUiRecipe(response?.data) };
  }

  /**
   * Create a recipe. `POST /api/recipes` absorbed Flask's `POST /recipes` and
   * `POST /send_recipe` (the "save the AI suggestion" flow) into one route.
   */
  static async createRecipe(data: CreateRecipeData): Promise<ApiResponse<Recipe>> {
    const response = await apiService.post<ApiResponse<RawRecipeRow>>(this.BASE_PATH, data, {
      timeout: WRITE_TIMEOUT
    });
    return { ...response, data: toUiRecipe(response?.data) };
  }

  /**
   * Update a recipe. The single `PUT /api/recipes/[telegram_id]` route replaces
   * Flask's two client-side forms (`/recipes/update/{id}` and `/recipes/{id}`)
   * and answers with the same serialization as `GET` — the raw recipe, not
   * Flask's `{ status, new_message_id }`.
   */
  static async updateRecipe(telegramId: number, data: UpdateRecipeData): Promise<ApiResponse<Recipe>> {
    const response = await apiService.put<ApiResponse<RawRecipeRow>>(
      `${this.BASE_PATH}/${telegramId}`,
      data,
      { timeout: WRITE_TIMEOUT }
    );
    return { ...response, data: toUiRecipe(response?.data) };
  }
}

export const recipeService = new RecipeService();

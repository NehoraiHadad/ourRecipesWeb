import { apiService } from './apiService';
import type { SerializedRecipeWithRelations } from '@/lib/serializers/recipeTypes';
import type { ApiResponse } from '../types/api';

export interface RecipeWriteData {
  /** The channel message, canonical format (built by `formatRecipeText`). */
  newText: string;
  image?: string | null;
}

/** A write may upload an image and re-parse the recipe text — slower than a plain read. */
const WRITE_TIMEOUT = 60000;

/** Every method speaks the shared wire contract (`SerializedRecipe`). */
export class RecipeService {
  private static readonly BASE_PATH = '/api/recipes';

  /** `GET /api/recipes/:telegram_id` — the recipe as the API defines it. */
  static async fetchRecipe(telegramId: number): Promise<SerializedRecipeWithRelations> {
    const response = await apiService.get<ApiResponse<SerializedRecipeWithRelations>>(
      `${this.BASE_PATH}/${telegramId}`
    );
    return response?.data;
  }

  /**
   * `PUT /api/recipes/:telegram_id`. The single update route replaces Flask's
   * two client-side forms and answers with the same serialization as `GET` —
   * the recipe the server re-parsed from `newText`, not `{ status, new_message_id }`.
   */
  static async saveRecipe(
    telegramId: number,
    data: RecipeWriteData
  ): Promise<SerializedRecipeWithRelations> {
    const response = await apiService.put<ApiResponse<SerializedRecipeWithRelations>>(
      `${this.BASE_PATH}/${telegramId}`,
      data,
      { timeout: WRITE_TIMEOUT }
    );
    return response?.data;
  }

  /**
   * `POST /api/recipes` — absorbed Flask's `POST /recipes` and `POST
   * /send_recipe` (the "save the AI suggestion" flow) into one route.
   */
  static async addRecipe(data: RecipeWriteData): Promise<SerializedRecipeWithRelations> {
    const response = await apiService.post<ApiResponse<SerializedRecipeWithRelations>>(
      this.BASE_PATH,
      data,
      { timeout: WRITE_TIMEOUT }
    );
    return response?.data;
  }

  /** `DELETE /api/recipes/:telegram_id` archives the recipe and answers `204 No Content`. */
  static async deleteRecipe(telegramId: number): Promise<void> {
    await apiService.delete<null>(`${this.BASE_PATH}/${telegramId}`);
  }
}

export const recipeService = new RecipeService();

import { apiService } from './apiService';
import type { RecipeVersion } from '../types/index';

/** Flat body of `POST /api/versions/recipe/:telegram_id/restore/:versionId`. */
export interface RestoredVersion {
  message: string;
  title: string | null;
  details: string | null;
  image: string | null;
}

export class VersionService {
  private static readonly BASE_PATH = '/api/versions';

  /**
   * Version history for a recipe, keyed by its `telegram_id`.
   * `GET /api/versions/recipe/:telegram_id` answers with a bare array.
   */
  static async getVersions(telegramId: number): Promise<RecipeVersion[]> {
    return apiService.get<RecipeVersion[]>(`${this.BASE_PATH}/recipe/${telegramId}`);
  }

  /**
   * Restore a previous version. Answers with the flat
   * `{ message, title, details, image }` body (not wrapped in `data`).
   */
  static async restoreVersion(telegramId: number, versionId: number): Promise<RestoredVersion> {
    return apiService.post<RestoredVersion>(
      `${this.BASE_PATH}/recipe/${telegramId}/restore/${versionId}`,
      undefined,
      { timeout: 60000 }
    );
  }
}

export const versionService = new VersionService();

import { apiService } from './apiService';
import type { ApiResponse } from '../types/api';
import type { RecipeVersion } from '../types/index';

interface CreateVersionData {
  recipe_id: number;
  content: {
    title: string;
    raw_content: string;
    categories?: string[];
    ingredients?: string[];
    instructions?: string;
  };
  change_description?: string;
  image?: string | null;
}

export class VersionService {
  private static readonly BASE_PATH = '/versions';

  // Get all versions for a recipe
  static async getVersions(recipeId: number): Promise<ApiResponse<RecipeVersion[]>> {
    return apiService.get<ApiResponse<RecipeVersion[]>>(`${this.BASE_PATH}/recipe/${recipeId}`);
  }

  // Get a specific version
  static async getVersion(versionId: number): Promise<ApiResponse<RecipeVersion>> {
    return apiService.get<ApiResponse<RecipeVersion>>(`${this.BASE_PATH}/${versionId}`);
  }

  // Create a new version
  static async createVersion(data: CreateVersionData): Promise<ApiResponse<RecipeVersion>> {
    return apiService.post<ApiResponse<RecipeVersion>>(this.BASE_PATH, data);
  }

  // Restore a version
  static async restoreVersion(versionId: number): Promise<ApiResponse<RecipeVersion>> {
    return apiService.post<ApiResponse<RecipeVersion>>(`${this.BASE_PATH}/${versionId}/restore`);
  }

  // Compare versions
  static async compareVersions(versionId1: number, versionId2: number): Promise<ApiResponse<any>> {
    return apiService.get<ApiResponse<any>>(`${this.BASE_PATH}/compare/${versionId1}/${versionId2}`);
  }
}

export const versionService = new VersionService(); 
import { apiService } from './apiService';
import type { ApiResponse } from '../types/api';

export type Category = string;

export class CategoryService {
  private static readonly BASE_PATH = '/api/categories';

  // Get all categories (the only category endpoint the API exposes)
  static async getCategories(): Promise<ApiResponse<Category[]>> {
    return apiService.get<ApiResponse<Category[]>>(this.BASE_PATH);
  }
}

export const categoryService = new CategoryService();

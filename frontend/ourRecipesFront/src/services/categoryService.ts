import { apiService } from './apiService';
import type { ApiResponse } from '../types/api';

export type Category = string;

export class CategoryService {
  private static readonly BASE_PATH = '/categories';

  // Get all categories
  static async getCategories(): Promise<ApiResponse<Category[]>> {
    return apiService.get<ApiResponse<Category[]>>(this.BASE_PATH);
  }

  // Get a single category by ID
  static async getCategoryById(id: number): Promise<ApiResponse<Category>> {
    return apiService.get<ApiResponse<Category>>(`${this.BASE_PATH}/${id}`);
  }

  // Create a new category
  static async createCategory(name: string): Promise<ApiResponse<Category>> {
    return apiService.post<ApiResponse<Category>>(this.BASE_PATH, { name });
  }

  // Update a category
  static async updateCategory(id: number, name: string): Promise<ApiResponse<Category>> {
    return apiService.put<ApiResponse<Category>>(`${this.BASE_PATH}/${id}`, { name });
  }

  // Delete a category
  static async deleteCategory(id: number): Promise<ApiResponse<void>> {
    return apiService.delete<ApiResponse<void>>(`${this.BASE_PATH}/${id}`);
  }

  // Get recipes by category
  static async getRecipesByCategory(id: number): Promise<ApiResponse<any[]>> {
    return apiService.get<ApiResponse<any[]>>(`${this.BASE_PATH}/${id}/recipes`);
  }
}

export const categoryService = new CategoryService(); 
import { apiService } from './apiService';
import type { ApiResponse, SearchParams } from '../types/api';
import type { recipe as Recipe } from '../types/index';
import type { Category } from './categoryService';
import type { Place } from '../components/place/types';

export interface SearchResult {
  id: number;
  title: string;
  description?: string;
  type: 'recipe' | 'category' | 'place';
  matchScore: number;
}

export interface SearchResponse {
  results: Record<string, Recipe>;
  total: number;
  hasMore: boolean;
}

export interface FilterOptions {
  categories?: string[];
  difficulty?: string;
  preparationTime?: number;
  includeTerms?: string[];
  excludeTerms?: string[];
}

export class SearchService {
  private static readonly BASE_PATH = '/recipes/search';

  // Global search across all types
  static async search(params: SearchParams): Promise<SearchResponse> {
    try {
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

      const response = await apiService.get<SearchResponse>(`${this.BASE_PATH}?${queryParams.toString()}`);
      console.log('API Response:', response); // For debugging
      
      // Return the response directly since it's already in the correct format
      return response || { results: {}, total: 0, hasMore: false };
      
    } catch (error) {
      console.error('Search failed:', error);
      return {
        results: {},
        total: 0,
        hasMore: false
      };
    }
  }

  // Search recipes with filters
  static async searchRecipes(query: string, filters?: FilterOptions): Promise<ApiResponse<Record<string, Recipe>>> {
    try {
      const queryParams = new URLSearchParams({ query });
      
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach(v => queryParams.append(key, v.toString()));
            } else {
              queryParams.append(key, value.toString());
            }
          }
        });
      }

      const response = await apiService.get<ApiResponse<Record<string, Recipe>>>(`${this.BASE_PATH}/recipes?${queryParams.toString()}`);
      return {
        ...response,
        data: response.data || {}
      };
    } catch (error) {
      console.error('Recipe search failed:', error);
      return {
        data: {},
        status: 500,
        message: error instanceof Error ? error.message : 'Recipe search failed'
      };
    }
  }

  // Search categories
  static async searchCategories(query: string): Promise<ApiResponse<Category[]>> {
    return apiService.get<ApiResponse<Category[]>>(`${this.BASE_PATH}/categories?query=${encodeURIComponent(query)}`);
  }

  // Search places
  static async searchPlaces(query: string): Promise<ApiResponse<Place[]>> {
    return apiService.get<ApiResponse<Place[]>>(`${this.BASE_PATH}/places?query=${encodeURIComponent(query)}`);
  }

  // Get search suggestions
  static async getSearchSuggestions(query: string): Promise<ApiResponse<string[]>> {
    return apiService.get<ApiResponse<string[]>>(`${this.BASE_PATH}/suggestions?q=${encodeURIComponent(query)}`);
  }
}

export const searchService = new SearchService(); 

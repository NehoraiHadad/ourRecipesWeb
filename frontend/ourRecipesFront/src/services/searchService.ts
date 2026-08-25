import { apiService } from './apiService';
import { toUiRecipe, type RawRecipeRow } from './recipeMapper';
import type { ApiResponse, SearchParams } from '../types/api';
import type { recipe as Recipe } from '../types/index';

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

/** Raw body of `GET /api/recipes/search` (see `paginatedResponse`). */
interface PaginatedSearchResponse {
  data: RawRecipeRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export class SearchService {
  private static readonly BASE_PATH = '/api/recipes/search';

  // Recipe search
  static async search(params: SearchParams): Promise<SearchResponse> {
    try {
      // `GET /api/recipes/search` understands `query`, a single `category`,
      // an upper-case `difficulty` and pagination. Anything else the UI can
      // ask for (extra categories, prep time, include/exclude terms) has no
      // server-side equivalent and is filtered out here rather than sent as
      // dead query string.
      const queryParams = new URLSearchParams();
      const { query, categories, difficulty } = params as SearchParams & {
        categories?: string[];
        difficulty?: string;
      };

      if (query) queryParams.set('query', String(query));

      const category = Array.isArray(categories) ? categories[0] : categories;
      if (category) queryParams.set('category', String(category));

      if (difficulty) queryParams.set('difficulty', String(difficulty).toUpperCase());

      const response = await apiService.get<PaginatedSearchResponse>(
        `${this.BASE_PATH}?${queryParams.toString()}`
      );

      const rows = response?.data ?? [];
      const pagination = response?.pagination;

      // The UI works with a `{ [telegram_id]: recipe }` map.
      const results: Record<string, Recipe> = {};
      rows.forEach((row) => {
        const uiRecipe = toUiRecipe(row);
        results[String(uiRecipe.telegram_id || uiRecipe.id)] = uiRecipe;
      });

      return {
        results,
        total: pagination?.totalItems ?? rows.length,
        hasMore: pagination ? pagination.page < pagination.totalPages : false
      };
    } catch (error) {
      console.error('Search failed:', error);
      return {
        results: {},
        total: 0,
        hasMore: false
      };
    }
  }

  // Get search suggestions
  static async getSearchSuggestions(query: string): Promise<ApiResponse<string[]>> {
    return apiService.get<ApiResponse<string[]>>(
      `${this.BASE_PATH}/suggestions?q=${encodeURIComponent(query)}`
    );
  }
}

export const searchService = new SearchService();

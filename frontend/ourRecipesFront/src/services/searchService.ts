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

  /** Drop blank entries and join a list into a `a,b,c` query param value. */
  private static toList(values: string[] | string | undefined): string {
    const items = Array.isArray(values) ? values : values ? [values] : [];
    return items
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(',');
  }

  // Recipe search
  static async search(params: SearchParams): Promise<SearchResponse> {
    try {
      // Every advanced filter the UI collects has a server-side equivalent on
      // `GET /api/recipes/search`; see that route for the semantics of each.
      const queryParams = new URLSearchParams();
      const {
        query,
        categories,
        difficulty,
        preparationTime,
        includeTerms,
        excludeTerms,
        page,
        pageSize
      } = params;

      if (query) queryParams.set('query', String(query));

      const categoryList = this.toList(categories);
      if (categoryList) queryParams.set('categories', categoryList);

      if (difficulty) queryParams.set('difficulty', String(difficulty).toUpperCase());

      if (preparationTime) queryParams.set('maxPrepTime', String(preparationTime));

      const include = this.toList(includeTerms);
      if (include) queryParams.set('includeTerms', include);

      const exclude = this.toList(excludeTerms);
      if (exclude) queryParams.set('excludeTerms', exclude);

      if (page) queryParams.set('page', String(page));
      if (pageSize) queryParams.set('pageSize', String(pageSize));

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
      `${this.BASE_PATH}/suggestions?query=${encodeURIComponent(query)}`
    );
  }
}

export const searchService = new SearchService();

import { apiService } from './apiService';
import { toUiRecipe } from './recipeMapper';
import type { SerializedRecipe } from '@/lib/serializers/recipeTypes';
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
  data: SerializedRecipe[];
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

      // Flask returned every match in one response and the UI still assumes
      // that: it renders `results` as the complete set, with no load-more
      // control, and shows its size as the result count. The route caps
      // `pageSize` at 100, so unless the caller paginates explicitly we walk
      // the pages and accumulate (bounded as a runaway guard).
      const explicitPaging = Boolean(page || pageSize);
      const effectivePageSize = pageSize ?? 100;
      const MAX_PAGES = 20;

      const results: Record<string, Recipe> = {};
      let total = 0;
      let hasMore = false;
      let currentPage = page ?? 1;

      for (let i = 0; i < MAX_PAGES; i++) {
        queryParams.set('page', String(currentPage));
        queryParams.set('pageSize', String(effectivePageSize));

        const response = await apiService.get<PaginatedSearchResponse>(
          `${this.BASE_PATH}?${queryParams.toString()}`
        );

        const rows = response?.data ?? [];
        const pagination = response?.pagination;

        // The UI works with a `{ [telegram_id]: recipe }` map.
        rows.forEach((row) => {
          const uiRecipe = toUiRecipe(row);
          results[String(uiRecipe.telegram_id || uiRecipe.id)] = uiRecipe;
        });

        total = pagination?.totalItems ?? rows.length;
        hasMore = pagination ? pagination.page < pagination.totalPages : false;

        if (explicitPaging || !hasMore || rows.length === 0) break;
        currentPage += 1;
      }

      return { results, total, hasMore };
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
  // The route returns recipe rows ({ id, title, telegram_id, image_url });
  // the UI contract is a plain list of title strings.
  static async getSearchSuggestions(query: string): Promise<ApiResponse<string[]>> {
    const response = await apiService.get<ApiResponse<Array<string | { title?: string }>>>(
      `${this.BASE_PATH}/suggestions?query=${encodeURIComponent(query)}`
    );
    const items = Array.isArray(response) ? response : response?.data ?? [];
    const titles = items
      .map((item) => (typeof item === 'string' ? item : item?.title))
      .filter((title): title is string => Boolean(title));
    return { data: titles };
  }
}

export const searchService = new SearchService();

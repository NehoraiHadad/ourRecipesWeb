/**
 * The `{ data, message? }` success envelope the API routes emit (see
 * `src/lib/utils/api-response.ts`). No HTTP status lives in the body.
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Everything the advanced-search UI can ask for. Each field maps onto a
 * `GET /api/recipes/search` query param — see that route for the exact
 * semantics (categories and include-terms narrow, exclude-terms subtract).
 */
export interface SearchParams extends PaginationParams {
  query: string;
  types?: ('recipe' | 'category' | 'place')[];
  /** Recipe must carry every listed category. */
  categories?: string[];
  /** Upper bound on `preparation_time`, in minutes. */
  preparationTime?: number;
  /** `easy` | `medium` | `hard` (any casing). */
  difficulty?: string;
  /** Every term must appear in the title or the recipe text. */
  includeTerms?: string[];
  /** No term may appear in the title or the recipe text. */
  excludeTerms?: string[];
  page?: number;
  pageSize?: number;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
} 
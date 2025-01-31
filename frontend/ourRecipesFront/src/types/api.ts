export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface SearchParams extends PaginationParams {
  query: string;
  types?: ('recipe' | 'category' | 'place')[];
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
} 
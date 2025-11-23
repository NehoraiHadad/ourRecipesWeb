/**
 * Standardized API response helpers
 */

export interface ApiSuccessResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    statusCode: number;
    errors?: any[];
  };
}

/**
 * Success response helper
 */
export function successResponse<T>(
  data: T,
  message?: string,
  status = 200
): Response {
  const response: ApiSuccessResponse<T> = { data };
  if (message) response.message = message;

  return Response.json(response, { status });
}

/**
 * Created response (201)
 */
export function createdResponse<T>(
  data: T,
  message = 'Resource created successfully'
): Response {
  return successResponse(data, message, 201);
}

/**
 * No content response (204)
 */
export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Paginated response helper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export function paginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number,
  totalItems: number
): Response {
  const response: PaginatedResponse<T> = {
    data,
    pagination: {
      page,
      pageSize,
      totalPages: Math.ceil(totalItems / pageSize),
      totalItems
    }
  };

  return Response.json(response);
}

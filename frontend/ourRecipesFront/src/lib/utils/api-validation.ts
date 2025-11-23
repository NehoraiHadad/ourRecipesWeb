/**
 * Request validation utilities
 */
import { BadRequestError } from './api-errors';

/**
 * Parse and validate JSON body
 */
export async function parseBody<T>(request: Request): Promise<T> {
  try {
    return await request.json();
  } catch (error) {
    throw BadRequestError('Invalid JSON body');
  }
}

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: string[]
): void {
  const missingFields = requiredFields.filter(
    field => data[field] === undefined || data[field] === null || data[field] === ''
  );

  if (missingFields.length > 0) {
    throw BadRequestError(
      'Missing required fields',
      missingFields.map(field => ({ field, message: 'This field is required' }))
    );
  }
}

/**
 * Parse pagination params
 */
export function parsePaginationParams(url: URL) {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw BadRequestError('Invalid pagination parameters');
  }

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

/**
 * Parse search params
 */
export function getSearchParam(url: URL, param: string): string | null {
  return url.searchParams.get(param);
}

/**
 * Validate ID parameter
 */
export function validateId(id: string | undefined): number {
  if (!id) {
    throw BadRequestError('ID is required');
  }

  const numId = parseInt(id, 10);
  if (isNaN(numId) || numId < 1) {
    throw BadRequestError('Invalid ID format');
  }

  return numId;
}

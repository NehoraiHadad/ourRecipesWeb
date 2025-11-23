/**
 * API Error handling utilities
 */

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public errors?: any[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Common error constructors
export const BadRequestError = (message: string, errors?: any[]) =>
  new ApiError(400, message, errors);

export const UnauthorizedError = (message = 'Unauthorized') =>
  new ApiError(401, message);

export const ForbiddenError = (message = 'Forbidden') =>
  new ApiError(403, message);

export const NotFoundError = (message = 'Not found') =>
  new ApiError(404, message);

export const ConflictError = (message: string) =>
  new ApiError(409, message);

export const InternalServerError = (message = 'Internal server error') =>
  new ApiError(500, message);

/**
 * Handle errors and return Response
 */
export function handleApiError(error: unknown): Response {
  console.error('API Error:', error);

  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          message: error.message,
          statusCode: error.statusCode,
          errors: error.errors
        }
      },
      { status: error.statusCode }
    );
  }

  // Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    return handlePrismaError(error);
  }

  // Unknown errors
  return Response.json(
    {
      error: {
        message: 'Internal server error',
        statusCode: 500
      }
    },
    { status: 500 }
  );
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: any): Response {
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      return Response.json(
        {
          error: {
            message: 'A record with this value already exists',
            statusCode: 409,
            field: error.meta?.target
          }
        },
        { status: 409 }
      );

    case 'P2025': // Record not found
      return Response.json(
        {
          error: {
            message: 'Record not found',
            statusCode: 404
          }
        },
        { status: 404 }
      );

    case 'P2003': // Foreign key constraint
      return Response.json(
        {
          error: {
            message: 'Related record not found',
            statusCode: 400
          }
        },
        { status: 400 }
      );

    default:
      return Response.json(
        {
          error: {
            message: 'Database error',
            statusCode: 500
          }
        },
        { status: 500 }
      );
  }
}

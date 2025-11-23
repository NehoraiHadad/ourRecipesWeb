/**
 * Request logging middleware for API routes
 */
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Log API requests
 */
export async function logRequest(
  request: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  const startTime = Date.now();
  const { method, url, headers } = request;
  const pathname = new URL(url).pathname;

  // Log request
  logger.info({
    type: 'request',
    method,
    path: pathname,
    userAgent: headers.get('user-agent') || 'unknown',
    ip: headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'unknown'
  }, `${method} ${pathname}`);

  let response: Response;
  let error: any;

  try {
    // Execute handler
    response = await handler();
  } catch (err) {
    error = err;
    // Log error
    logger.error({
      type: 'request_error',
      method,
      path: pathname,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    }, `${method} ${pathname} - Error`);

    // Re-throw to be handled by error handler
    throw err;
  } finally {
    const duration = Date.now() - startTime;

    if (!error) {
      // Log response
      logger.info({
        type: 'response',
        method,
        path: pathname,
        status: response!.status,
        duration
      }, `${method} ${pathname} - ${response!.status} (${duration}ms)`);
    }
  }

  return response;
}

/**
 * Wrapper for route handlers
 */
export function withLogging(
  handler: (req: NextRequest, context?: any) => Promise<Response>
) {
  return async (req: NextRequest, context?: any) => {
    return logRequest(req, () => handler(req, context));
  };
}

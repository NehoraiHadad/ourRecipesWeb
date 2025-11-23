/**
 * Structured logging helpers
 */
import { logger } from '@/lib/logger';

/**
 * Log database query
 */
export function logDatabaseQuery(
  model: string,
  operation: string,
  duration: number,
  recordCount?: number
) {
  logger.debug({
    type: 'database',
    model,
    operation,
    duration,
    recordCount
  }, `DB: ${model}.${operation} (${duration}ms)`);
}

/**
 * Log external API call
 */
export function logExternalApiCall(
  service: string,
  endpoint: string,
  method: string,
  duration: number,
  status?: number
) {
  logger.info({
    type: 'external_api',
    service,
    endpoint,
    method,
    duration,
    status
  }, `API: ${service} ${method} ${endpoint} - ${status} (${duration}ms)`);
}

/**
 * Log performance metric
 */
export function logPerformance(
  operation: string,
  duration: number,
  metadata?: Record<string, any>
) {
  const level = duration > 1000 ? 'warn' : 'debug';

  logger[level]({
    type: 'performance',
    operation,
    duration,
    ...metadata
  }, `Performance: ${operation} took ${duration}ms`);
}

/**
 * Measure and log execution time
 */
export async function measureExecutionTime<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    logPerformance(operation, duration, metadata);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      type: 'performance',
      operation,
      duration,
      error: error instanceof Error ? error.message : String(error),
      ...metadata
    }, `Performance: ${operation} failed after ${duration}ms`);

    throw error;
  }
}

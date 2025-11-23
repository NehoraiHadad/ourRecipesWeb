/**
 * GET /api/ping
 * Health check endpoint
 *
 * Checks:
 * - API is responding
 * - Database connection is healthy
 * - Returns server uptime
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime()
    };

    logger.debug(healthData, 'Health check');

    return successResponse(healthData);
  } catch (error) {
    logger.error({ error }, 'Health check failed');

    // Return 503 Service Unavailable if DB is down
    return new Response(
      JSON.stringify({
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * GET /api/menus
 * List user's menus + public menus from others
 *
 * Access control: User's own menus (public/private) + all public menus
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  paginatedResponse
} from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // TODO: Get user from session in Phase 3
    // For now, return all menus for testing
    const userId = 'system'; // Placeholder

    // Pagination
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    logger.debug({ userId, skip, take }, 'Fetching menus');

    // Get menus: user's own + public from others
    // TODO: When auth is added, use:
    // where: { OR: [{ user_id: userId }, { is_public: true }] }
    const where = {}; // Return all menus for now

    const totalItems = await prisma.menu.count({ where });

    const menus = await prisma.menu.findMany({
      where,
      select: {
        id: true,
        user_id: true,
        name: true,
        event_type: true,
        description: true,
        total_servings: true,
        dietary_type: true,
        share_token: true,
        is_public: true,
        created_at: true,
        updated_at: true,
        telegram_message_id: true,
        // Don't include meals for list view (performance)
        _count: {
          select: {
            meals: true,
            shopping_list_items: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: menus.length, total: totalItems }, 'Menus fetched');

    return paginatedResponse(menus, page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Fetch menus failed');
    return handleApiError(error);
  }
}

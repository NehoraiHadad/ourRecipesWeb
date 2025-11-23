/**
 * GET /api/categories
 * Get all unique categories from recipes
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    logger.debug('Fetching categories');

    // Get all active recipes with categories
    const recipes = await prisma.recipe.findMany({
      where: {
        status: 'ACTIVE',
        categories: {
          not: null
        }
      },
      select: {
        categories: true
      }
    });

    // Extract unique categories
    const categoriesSet = new Set<string>();

    recipes.forEach((recipe: { categories: string | null }) => {
      if (recipe.categories) {
        // Categories are comma-separated string
        const cats = recipe.categories.split(',').map(c => c.trim()).filter(Boolean);
        cats.forEach(cat => {
          if (cat) categoriesSet.add(cat);
        });
      }
    });

    // Convert to sorted array (Hebrew-aware sorting)
    const categories = Array.from(categoriesSet).sort((a, b) =>
      a.localeCompare(b, 'he')
    );

    logger.info({ count: categories.length }, 'Categories fetched');

    return successResponse(categories);
  } catch (error) {
    logger.error({ error }, 'Fetch categories failed');
    return handleApiError(error);
  }
}

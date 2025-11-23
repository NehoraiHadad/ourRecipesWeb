/**
 * GET /api/recipes/search
 * Search recipes with filters (query, category, difficulty)
 *
 * Supports pagination and case-insensitive search
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  paginatedResponse
} from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { parsePaginationParams } from '@/lib/utils/api-validation';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

const VALID_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
type RecipeDifficulty = typeof VALID_DIFFICULTIES[number];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract search parameters
    const query = searchParams.get('query') || '';
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty') as RecipeDifficulty | null;

    // Pagination
    const { page, pageSize, skip, take } = parsePaginationParams(
      new URL(request.url)
    );

    logger.debug({ query, category, difficulty, page, pageSize }, 'Searching recipes');

    // Build where clause
    const where: Prisma.RecipeWhereInput = {
      status: 'ACTIVE', // Only active recipes
    };

    // Text search (in title, ingredients, or raw_content)
    if (query) {
      where.OR = [
        {
          title: {
            contains: query,
            mode: 'insensitive' // Case-insensitive
          }
        },
        {
          ingredients: {
            contains: query,
            mode: 'insensitive'
          }
        },
        {
          raw_content: {
            contains: query,
            mode: 'insensitive'
          }
        }
      ];
    }

    // Category filter (comma-separated string contains)
    if (category) {
      where.categories = {
        contains: category,
        mode: 'insensitive'
      };
    }

    // Difficulty filter (enum)
    if (difficulty && VALID_DIFFICULTIES.includes(difficulty)) {
      where.difficulty = difficulty;
    }

    // Get total count
    const totalItems = await prisma.recipe.count({ where });

    // Get recipes (select only needed fields for performance)
    const recipes = await prisma.recipe.findMany({
      where,
      select: {
        id: true,
        telegram_id: true,
        title: true,
        categories: true,
        difficulty: true,
        cooking_time: true,
        preparation_time: true,
        servings: true,
        image_url: true,
        created_at: true,
        is_verified: true
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take
    });

    logger.info({ count: recipes.length, total: totalItems, query }, 'Search completed');

    return paginatedResponse(recipes, page, pageSize, totalItems);
  } catch (error) {
    logger.error({ error }, 'Recipe search failed');
    return handleApiError(error);
  }
}

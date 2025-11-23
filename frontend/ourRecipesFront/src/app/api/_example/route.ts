/**
 * Example API route demonstrating best practices
 *
 * DELETE THIS FILE after understanding the pattern!
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  createdResponse,
  paginatedResponse
} from '@/lib/utils/api-response';
import {
  handleApiError,
  BadRequestError
} from '@/lib/utils/api-errors';
import {
  parseBody,
  validateRequiredFields,
  parsePaginationParams
} from '@/lib/utils/api-validation';

/**
 * GET /api/_example
 * List resources with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const { page, pageSize, skip, take } = parsePaginationParams(url);

    // Get total count
    const totalItems = await prisma.recipe.count();

    // Get paginated data
    const recipes = await prisma.recipe.findMany({
      skip,
      take,
      orderBy: { created_at: 'desc' }
    });

    return paginatedResponse(recipes, page, pageSize, totalItems);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/_example
 * Create new resource
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate body
    const body = await parseBody<{ telegram_id: number; title: string; raw_content: string }>(request);
    validateRequiredFields(body, ['telegram_id', 'raw_content']);

    // Create resource
    const recipe = await prisma.recipe.create({
      data: {
        telegram_id: body.telegram_id,
        title: body.title,
        raw_content: body.raw_content
      }
    });

    return createdResponse(recipe, 'Recipe created successfully');
  } catch (error) {
    return handleApiError(error);
  }
}

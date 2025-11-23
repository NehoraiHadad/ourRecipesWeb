/**
 * POST /api/recipes/refine
 * AI refinement of recipe based on feedback
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { refineRecipe } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.recipeText) {
      throw BadRequestError('recipeText is required');
    }

    if (!body.refinementRequest) {
      throw BadRequestError('refinementRequest is required');
    }

    logger.debug({ refinementRequest: body.refinementRequest }, 'Refining recipe');

    const refinedRecipe = await refineRecipe(body.recipeText, body.refinementRequest);

    logger.info('Recipe refined successfully');

    return successResponse({ message: refinedRecipe });
  } catch (error) {
    logger.error({ error }, 'Failed to refine recipe');
    return handleApiError(error);
  }
}

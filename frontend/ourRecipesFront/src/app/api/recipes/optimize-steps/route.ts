/**
 * POST /api/recipes/optimize-steps
 * AI optimization of recipe steps
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { optimizeRecipeSteps } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.recipeText) {
      throw BadRequestError('recipeText is required');
    }

    logger.debug('Optimizing recipe steps');

    const optimizedSteps = await optimizeRecipeSteps(body.recipeText);

    logger.info('Recipe steps optimized successfully');

    return successResponse({ message: optimizedSteps });
  } catch (error) {
    logger.error({ error }, 'Failed to optimize recipe steps');
    return handleApiError(error);
  }
}

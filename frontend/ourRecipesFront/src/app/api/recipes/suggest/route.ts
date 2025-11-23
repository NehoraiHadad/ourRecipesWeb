/**
 * POST /api/recipes/suggest
 * AI recipe suggestion based on preferences
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { generateRecipeSuggestion } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    logger.debug({ body }, 'Generating recipe suggestion');

    const suggestion = await generateRecipeSuggestion({
      ingredients: body.ingredients,
      mealType: body.mealType,
      quickPrep: body.quickPrep,
      childFriendly: body.childFriendly,
      additionalRequests: body.additionalRequests
    });

    logger.info('Recipe suggestion generated successfully');

    return successResponse({ message: suggestion });
  } catch (error) {
    logger.error({ error }, 'Failed to generate recipe suggestion');
    return handleApiError(error);
  }
}

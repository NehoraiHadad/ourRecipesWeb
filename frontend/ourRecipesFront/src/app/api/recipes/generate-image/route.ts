/**
 * POST /api/recipes/generate-image
 * AI image generation for recipe using HuggingFace
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { generateRecipeImage } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.recipeContent) {
      throw BadRequestError('recipeContent is required');
    }

    logger.debug({ contentLength: body.recipeContent.length }, 'Generating recipe image');

    const imageBase64 = await generateRecipeImage(body.recipeContent);

    logger.info('Recipe image generated successfully');

    // Full data-URI, like Flask and the sibling generate-infographic route —
    // the save paths (`decodeBase64Image`) reject anything without the prefix.
    return successResponse({ image: `data:image/jpeg;base64,${imageBase64}` });
  } catch (error) {
    logger.error({ error }, 'Failed to generate recipe image');
    return handleApiError(error);
  }
}

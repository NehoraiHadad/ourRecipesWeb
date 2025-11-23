/**
 * POST /api/recipes/reformat
 * AI reformatting of recipe text
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { reformatRecipe } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.text) {
      throw BadRequestError('text is required');
    }

    logger.debug({ textLength: body.text.length }, 'Reformatting recipe');

    const reformattedText = await reformatRecipe(body.text);

    logger.info('Recipe reformatted successfully');

    return successResponse({ message: reformattedText });
  } catch (error) {
    logger.error({ error }, 'Failed to reformat recipe');
    return handleApiError(error);
  }
}

/**
 * POST /api/recipes/suggest
 * AI recipe suggestion based on preferences
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { generateRecipeSuggestion } from '@/lib/services/aiService';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { serializePreviewFromParsed } from '@/lib/serializers/recipePreview';
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

    // Parsed here, server-side, so the client never re-parses channel text
    // (STRUCTURE_REFACTOR_TASKS.md §D2) — it renders `recipe` directly.
    const recipe = serializePreviewFromParsed(parseRecipeMessage(suggestion));
    return successResponse({ message: suggestion, recipe });
  } catch (error) {
    logger.error({ error }, 'Failed to generate recipe suggestion');
    return handleApiError(error);
  }
}

// AI generation is slower than the platform default.
export const maxDuration = 60; // 60 seconds (Vercel)

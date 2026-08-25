/**
 * POST /api/recipes/optimize-steps
 * AI optimization of recipe steps.
 *
 * Answers `{ data: <OptimizedSteps> }` — the structured plan defined in
 * `src/lib/recipes/optimizedSteps.ts`, which is exactly what
 * `RecipeStepOptimizer` renders. The model is asked for that JSON via a
 * Gemini `responseSchema`, and the answer is validated here: a non-conforming
 * answer becomes a 502 rather than free text leaking into the UI.
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { optimizeRecipeSteps } from '@/lib/services/aiService';
import { parseOptimizedSteps } from '@/lib/recipes/optimizedSteps';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError, BadGatewayError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.recipeText) {
      throw BadRequestError('recipeText is required');
    }

    logger.debug('Optimizing recipe steps');

    const raw = await optimizeRecipeSteps(body.recipeText);
    const optimizedSteps = parseOptimizedSteps(raw);

    if (!optimizedSteps) {
      logger.warn({ raw }, 'Step optimization returned a non-conforming plan');
      throw BadGatewayError('The optimization service returned an unusable plan');
    }

    logger.info(
      { groups: optimizedSteps.optimized_steps.length },
      'Recipe steps optimized successfully'
    );

    return successResponse(optimizedSteps);
  } catch (error) {
    logger.error({ error }, 'Failed to optimize recipe steps');
    return handleApiError(error);
  }
}

// AI generation is slower than the platform default.
export const maxDuration = 60; // 60 seconds (Vercel)

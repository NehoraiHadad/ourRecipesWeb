/**
 * POST /api/recipes/generate-infographic
 * AI-generated Hebrew recipe infographic image (Gemini 3 Pro Image /
 * "Nano Banana Pro").
 *
 * Port of `AIService.generate_recipe_infographic` +
 * `routes/recipes.py::generate_recipe_infographic`. Requires a logged-in
 * session (matches Flask's `@jwt_required()`) — it doesn't write anything,
 * so it isn't gated behind edit permission the way the recipe-mutating
 * routes are.
 */
import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth';
import { generateRecipeInfographic } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parseBody } from '@/lib/utils/api-validation';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/recipes/generate-infographic:POST' });

interface GenerateInfographicBody {
  recipeContent?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const body = await parseBody<GenerateInfographicBody>(request);
    if (!body?.recipeContent) {
      throw BadRequestError('No recipe content provided');
    }

    log.debug({ contentLength: body.recipeContent.length }, 'Generating recipe infographic');

    const imageBase64 = await generateRecipeInfographic(body.recipeContent);

    log.info('Recipe infographic generated successfully');

    return successResponse({ image: `data:image/png;base64,${imageBase64}` });
  } catch (error) {
    log.error({ error }, 'Infographic generation failed');
    return handleApiError(error);
  }
}

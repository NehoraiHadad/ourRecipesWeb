/**
 * POST /api/recipes/generate-infographic
 * AI-generated Hebrew recipe infographic via KIE (`nano-banana-pro` by
 * default), falling back to a direct Gemini call on KIE failure —
 * `docs/architecture/AI_UPGRADE_TASKS.md` §2A.
 *
 * Requires a logged-in session (matches Flask's `@jwt_required()`) — it
 * doesn't write anything, so it isn't gated behind edit permission the way
 * the recipe-mutating routes are.
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

/** KIE task creation + polling (plus a possible Gemini fallback) can be slow. */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const body = await parseBody<GenerateInfographicBody>(request);
    if (!body?.recipeContent) {
      throw BadRequestError('No recipe content provided');
    }

    log.debug({ contentLength: body.recipeContent.length }, 'Generating recipe infographic');

    const imageUrl = await generateRecipeInfographic(body.recipeContent);

    log.info('Recipe infographic generated successfully');

    return successResponse({ image_url: imageUrl });
  } catch (error) {
    log.error({ error }, 'Infographic generation failed');
    return handleApiError(error);
  }
}

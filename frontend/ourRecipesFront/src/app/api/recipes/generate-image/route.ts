/**
 * POST /api/recipes/generate-image
 * AI recipe photo generation via KIE (`nano-banana-2` by default —
 * `docs/architecture/AI_UPGRADE_TASKS.md` §2A). Auth is enforced globally by
 * `src/middleware.ts` for every `/api/**` route.
 */
import { NextRequest } from 'next/server';
import { generateRecipeImage } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/recipes/generate-image:POST' });

/** KIE task creation + polling can take well over the platform default. */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.recipeContent) {
      throw BadRequestError('recipeContent is required');
    }

    log.debug({ contentLength: body.recipeContent.length }, 'Generating recipe image');

    const imageUrl = await generateRecipeImage(body.recipeContent);

    log.info('Recipe image generated successfully');

    return successResponse({ image_url: imageUrl });
  } catch (error) {
    log.error({ error }, 'Failed to generate recipe image');
    return handleApiError(error);
  }
}

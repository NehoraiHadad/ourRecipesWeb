/**
 * POST /api/menus/generate-preview
 * Generate menu preview using AI (without saving)
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { generateMenuPreview, type MenuPreferences } from '@/lib/ai/menu';
import { buildMenuPreview } from '@/lib/menus/menuPreview';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { prisma } from '@/lib/prisma';
import { PLANNABLE_RECIPE } from '@/lib/recipes/visibility';
import { logger } from '@/lib/logger';

/** The preview request body — `MenuPreferences` before validation. */
type MenuPreviewInput = Partial<MenuPreferences> & Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as MenuPreviewInput;

    // Validate required fields
    if (!body.name) {
      throw BadRequestError('Menu name is required');
    }

    if (!Array.isArray(body.meal_types) || body.meal_types.length === 0) {
      throw BadRequestError('At least one meal type is required');
    }

    logger.info(
      { name: body.name, meals: body.meal_types },
      'Menu preview request'
    );

    // Pre-check: Verify we have enough recipes
    const availableRecipes = await prisma.recipe.count({ where: PLANNABLE_RECIPE });

    if (availableRecipes < 5) {
      throw BadRequestError(
        `Not enough recipes. Only ${availableRecipes} available, need at least 5.`
      );
    }

    logger.debug({ availableRecipes }, 'Recipe count check passed');

    // Generate menu preview (may take 30-60 seconds)
    const menuPlan = await generateMenuPreview({
      name: body.name,
      event_type: body.event_type,
      servings: body.servings || 4,
      dietary_type: body.dietary_type,
      meal_types: body.meal_types,
      special_requests: body.special_requests
    });

    return successResponse({
      // The agent's plan carries bare recipe ids; the client contract is
      // `MenuPreview` — the same tree a saved menu renders.
      preview: await buildMenuPreview(menuPlan),
      preferences: body  // Echo back for save endpoint
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate menu preview');
    return handleApiError(error);
  }
}

// The agent session runs 60-150s in production (a 120s cap produced an
// intermittent 504 on 2026-08-25); must cover the client's 240s timeout
// (`menuService.generateMenuPreview`) or Vercel kills the function first.
// Fluid Compute makes the I/O-wait time nearly free.
export const maxDuration = 300;

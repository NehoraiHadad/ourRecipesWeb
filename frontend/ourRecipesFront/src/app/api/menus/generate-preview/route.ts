/**
 * POST /api/menus/generate-preview
 * Generate menu preview using AI (without saving)
 *
 * @note Authentication will be added in Phase 3
 */
import { NextRequest } from 'next/server';
import { generateMenuPreview } from '@/lib/services/menuPlannerService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      throw BadRequestError('Menu name is required');
    }

    if (!body.meal_types || body.meal_types.length === 0) {
      throw BadRequestError('At least one meal type is required');
    }

    logger.info(
      { name: body.name, meals: body.meal_types },
      'Menu preview request'
    );

    // Pre-check: Verify we have enough recipes
    const availableRecipes = await prisma.recipe.count({
      where: {
        status: 'ACTIVE',
        is_parsed: true
      }
    });

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
      preview: menuPlan,
      preferences: body  // Echo back for save endpoint
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate menu preview');
    return handleApiError(error);
  }
}

// Increase timeout for AI generation
export const maxDuration = 60; // 60 seconds (Vercel)

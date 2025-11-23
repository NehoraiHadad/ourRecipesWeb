/**
 * Example API route for single resource
 *
 * DELETE THIS FILE after understanding the pattern!
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  noContentResponse
} from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError
} from '@/lib/utils/api-errors';
import {
  parseBody,
  validateId
} from '@/lib/utils/api-validation';

/**
 * GET /api/_example/:id
 * Get single resource
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = validateId(params.id);

    const recipe = await prisma.recipe.findUnique({
      where: { id }
    });

    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    return successResponse(recipe);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/_example/:id
 * Update resource
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = validateId(params.id);
    const body = await parseBody<{ title?: string; raw_content?: string }>(request);

    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        title: body.title,
        raw_content: body.raw_content
      }
    });

    return successResponse(recipe, 'Recipe updated successfully');
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/_example/:id
 * Delete resource
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = validateId(params.id);

    await prisma.recipe.delete({
      where: { id }
    });

    return noContentResponse();
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/recipes/:telegram_id
 * Get single recipe by telegram_id
 *
 * Returns full recipe with relations (user_recipes, versions)
 * Uses telegram_id for compatibility with Flask API
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEditPermission, authErrorResponse } from '@/lib/auth';
import {
  recipeWithRelationsSelect,
  serializeRecipeWithRelations
} from '@/lib/serializers/recipe';
import { successResponse, noContentResponse } from '@/lib/utils/api-response';
import { handleApiError, NotFoundError, BadRequestError } from '@/lib/utils/api-errors';
import { validateTelegramId, parseBody } from '@/lib/utils/api-validation';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { decodeBase64Image, uploadRecipeImage } from '@/lib/recipes/image';
import { mirrorEditRecipe } from '@/lib/recipes/mirror';
import { commitPendingUpdate, applyEditMirrorResult } from '@/lib/recipes/updateRecipe';
import { archiveRecipe } from '@/lib/recipes/deleteRecipe';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const telegramId = validateTelegramId(params.telegram_id);

    logger.debug({ telegramId }, 'Fetching recipe');

    const recipe = await prisma.recipe.findUnique({
      where: {
        telegram_id: telegramId
      },
      select: recipeWithRelationsSelect
    });

    if (!recipe) {
      logger.warn({ telegramId }, 'Recipe not found');
      throw NotFoundError('Recipe not found');
    }

    logger.info({ recipeId: recipe.id, telegramId }, 'Recipe fetched');

    return successResponse(serializeRecipeWithRelations(recipe));
  } catch (error) {
    return handleApiError(error);
  }
}

interface UpdateRecipeBody {
  newText?: string;
  image?: string | null;
}

/**
 * PUT /api/recipes/:telegram_id
 * Update an existing recipe.
 *
 * Unifies Flask's two update paths the UI called (`PUT /recipes/update/{id}`
 * and `PUT /recipes/{id}` — IMPLEMENTATION_PLAN Appendix A) into this single
 * route. Body shape matches what the UI already sends: `{ newText, image? }`.
 *
 * DB-first / Telegram best-effort (ARCHITECTURE §4.3, Stage H1): a
 * `RecipeVersion` snapshot of the *previous* content is created and the new
 * content is committed to the DB with `sync_status: 'pending_telegram'`
 * *before* the channel message is mirrored (`editMessageText`/`Caption`/
 * `Media`). Only once that best-effort mirror resolves is the row patched to
 * `'synced'` (or left pending with `sync_error` set) — a mirror failure
 * never fails the request. Response shape matches `GET` above (the shared
 * `SerializedRecipeWithRelations`), not Flask's `{status, new_message_id}`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const auth = await requireEditPermission(request);
    if (!auth.ok) return authErrorResponse(auth);

    const telegramId = validateTelegramId(params.telegram_id);
    const body = await parseBody<UpdateRecipeBody>(request);

    if (!body?.newText || !body.newText.trim()) {
      throw BadRequestError('Missing required fields');
    }
    const newText = body.newText;

    const recipe = await prisma.recipe.findUnique({
      where: { telegram_id: telegramId },
      select: recipeWithRelationsSelect
    });
    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    const imageBuffer = decodeBase64Image(body.image);

    // Matches RecipeService.update_recipe: unchanged content + no new image -> no-op.
    if (recipe.raw_content === newText && !imageBuffer) {
      logger.debug({ telegramId }, 'Recipe update skipped — content unchanged');
      return successResponse(serializeRecipeWithRelations(recipe));
    }

    let imageUrl = recipe.image_url;
    if (imageBuffer) {
      const uploaded = await uploadRecipeImage(imageBuffer, `update-${recipe.id}-${Date.now()}`);
      // Best-effort: keep the previous image rather than losing it on a failed upload.
      if (uploaded) imageUrl = uploaded;
    }

    const parsed = parseRecipeMessage(newText);

    // DB-first: commit the new content as pending before touching Telegram.
    const pending = await commitPendingUpdate({
      recipe,
      newText,
      parsed,
      imageUrl,
      createdBy: auth.session.sub
    });

    const mirror = await mirrorEditRecipe({
      telegramId: recipe.telegram_id,
      text: newText,
      hadImage: Boolean(recipe.image_url),
      newImageUrl: imageBuffer ? imageUrl : null
    });

    const updated = await applyEditMirrorResult(pending.id, mirror);

    logger.info(
      { recipeId: updated.id, telegramId, syncStatus: updated.sync_status },
      'Recipe updated'
    );

    return successResponse(serializeRecipeWithRelations(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/recipes/:telegram_id
 * Archives a recipe (Stage F1): best-effort channel-message delete +
 * `status -> ARCHIVED`. Never a hard delete — matches the 🗑️ channel-edit
 * convention already handled by ingest (`isArchiveMarked`), just reachable
 * from the management UI instead of Telegram.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const auth = await requireEditPermission(request);
    if (!auth.ok) return authErrorResponse(auth);

    const telegramId = validateTelegramId(params.telegram_id);

    const recipe = await prisma.recipe.findUnique({
      where: { telegram_id: telegramId },
      select: { id: true, telegram_id: true }
    });
    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    await archiveRecipe(recipe);

    return noContentResponse();
  } catch (error) {
    return handleApiError(error);
  }
}

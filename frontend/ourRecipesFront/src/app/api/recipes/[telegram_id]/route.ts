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
import { successResponse, noContentResponse } from '@/lib/utils/api-response';
import { handleApiError, NotFoundError, BadRequestError } from '@/lib/utils/api-errors';
import { validateTelegramId, parseBody } from '@/lib/utils/api-validation';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { decodeBase64Image, uploadRecipeImage } from '@/lib/recipes/image';
import { snapshotVersion } from '@/lib/recipes/versioning';
import { mirrorEditRecipe } from '@/lib/recipes/mirror';
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
      include: {
        user_recipes: {
          select: {
            user_id: true,
            is_favorite: true
          }
        },
        versions: {
          select: {
            id: true,
            version_num: true,
            created_at: true,
            change_description: true
          },
          orderBy: {
            version_num: 'desc'
          },
          take: 5 // Latest 5 versions
        }
      }
    });

    if (!recipe) {
      logger.warn({ telegramId }, 'Recipe not found');
      throw NotFoundError('Recipe not found');
    }

    logger.info({ recipeId: recipe.id, telegramId }, 'Recipe fetched');

    return successResponse(recipe);
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
 * DB-first / Telegram best-effort (ARCHITECTURE §4.3): a `RecipeVersion`
 * snapshot of the *previous* content is created, the recipe row is updated,
 * and the channel message is mirrored (`editMessageText`/`Caption`/`Media`)
 * — a mirror failure downgrades `sync_status` to `'pending_telegram'` rather
 * than failing the request. Response shape matches `GET` above (raw Prisma
 * row + latest versions), not Flask's `{status, new_message_id}` — the UI's
 * direct-fetch call sites get re-pointed at this route during the Wave 2.A
 * cutover.
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

    const recipe = await prisma.recipe.findUnique({ where: { telegram_id: telegramId } });
    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    const imageBuffer = decodeBase64Image(body.image);

    // Matches RecipeService.update_recipe: unchanged content + no new image -> no-op.
    if (recipe.raw_content === newText && !imageBuffer) {
      logger.debug({ telegramId }, 'Recipe update skipped — content unchanged');
      return successResponse(recipe);
    }

    let imageUrl = recipe.image_url;
    if (imageBuffer) {
      const uploaded = await uploadRecipeImage(imageBuffer, `update-${recipe.id}-${Date.now()}`);
      // Best-effort: keep the previous image rather than losing it on a failed upload.
      if (uploaded) imageUrl = uploaded;
    }

    const mirror = await mirrorEditRecipe({
      telegramId: recipe.telegram_id,
      text: newText,
      hadImage: Boolean(recipe.image_url),
      newImageUrl: imageBuffer ? imageUrl : null
    });

    const parsed = parseRecipeMessage(newText);

    const updated = await prisma.$transaction(async (tx) => {
      await snapshotVersion(tx, recipe, {
        createdBy: auth.session.sub,
        changeDescription: 'Recipe update'
      });

      return tx.recipe.update({
        where: { id: recipe.id },
        data: {
          title: parsed.title || null,
          raw_content: newText,
          ingredients: parsed.ingredients.length ? parsed.ingredients.join('||') : null,
          instructions: parsed.instructions || null,
          categories: parsed.categories.length ? parsed.categories.join(',') : null,
          preparation_time: parsed.preparationTime ?? null,
          difficulty: parsed.difficulty ?? null,
          is_parsed: parsed.isParsed,
          parse_errors: parsed.parseErrors.length ? parsed.parseErrors.join('||') : null,
          image_url: imageUrl,
          sync_status: mirror.syncStatus,
          sync_error: mirror.syncError
        },
        include: {
          user_recipes: { select: { user_id: true, is_favorite: true } },
          versions: {
            select: { id: true, version_num: true, created_at: true, change_description: true },
            orderBy: { version_num: 'desc' },
            take: 5
          }
        }
      });
    });

    logger.info(
      { recipeId: updated.id, telegramId, syncStatus: updated.sync_status },
      'Recipe updated'
    );

    return successResponse(updated);
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

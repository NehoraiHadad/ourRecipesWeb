/**
 * POST /api/versions/recipe/:telegram_id/restore/:versionId
 * Restore a recipe to a previous version's content.
 *
 * Port of `routes/versions.py::restore_recipe_version`. Response is Flask's
 * flat shape — `{ message, title, details, image }`, not wrapped in
 * `{ data }` — `RecipeDetails.handleVersionRestore` reads
 * `restoredRecipe.title` / `.details` / `.image` directly off the JSON body.
 *
 * DB-first / Telegram best-effort (ARCHITECTURE §4.3): Flask raises (and
 * 500s) when the Telegram edit fails during a restore; here the DB update
 * always commits and a mirror failure only downgrades `sync_status` to
 * `'pending_telegram'`, per the Wave 1.B brief ("same best-effort").
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VISIBLE_RECIPE } from '@/lib/recipes/visibility';
import { requireEditPermission, authErrorResponse } from '@/lib/auth';
import { handleApiError, NotFoundError } from '@/lib/utils/api-errors';
import { validateId, validateTelegramId } from '@/lib/utils/api-validation';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { snapshotVersion } from '@/lib/recipes/versioning';
import { mirrorEditRecipe } from '@/lib/recipes/mirror';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/versions/.../restore' });

export async function POST(
  request: NextRequest,
  { params }: { params: { telegram_id: string; versionId: string } }
) {
  try {
    const auth = await requireEditPermission(request);
    if (!auth.ok) return authErrorResponse(auth);

    const telegramId = validateTelegramId(params.telegram_id);
    const versionId = validateId(params.versionId);

    // A deleted recipe has no restorable history — 404, like its GET.
    const recipe = await prisma.recipe.findFirst({
      where: { ...VISIBLE_RECIPE, telegram_id: telegramId }
    });
    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    const version = await prisma.recipeVersion.findUnique({ where: { id: versionId } });
    if (!version || version.recipe_id !== recipe.id) {
      throw NotFoundError('Version not found');
    }

    const content = (version.content ?? {}) as Record<string, unknown>;
    const versionRawContent = typeof content.raw_content === 'string' ? content.raw_content : '';
    const versionImageUrl = typeof content.image_url === 'string' ? content.image_url : null;

    // Port of `_is_content_identical` (raw_content + image).
    const contentIdentical =
      versionRawContent === recipe.raw_content &&
      versionImageUrl === (recipe.image_url ?? null);

    if (contentIdentical) {
      log.debug({ telegramId, versionId }, 'Restore skipped — content identical');
      return Response.json({
        message: 'No changes needed - content is identical',
        title: recipe.title,
        details: recipe.raw_content,
        image: recipe.image_url
      });
    }

    // Preserve the current image unless this version actually carries one —
    // mirrors `update_content(image_data=version.image_data)`, which only
    // overwrites when the incoming value isn't `None`.
    const restoredImageUrl = versionImageUrl ?? recipe.image_url;

    const mirror = await mirrorEditRecipe({
      telegramId: recipe.telegram_id,
      text: versionRawContent,
      hadImage: Boolean(recipe.image_url),
      newImageUrl: versionImageUrl
    });

    const parsed = parseRecipeMessage(versionRawContent);
    const restoreDescription = `שחזור לגרסה ${version.version_num ?? ''}`.trim();

    const updated = await prisma.$transaction(async (tx) => {
      await snapshotVersion(tx, recipe, {
        createdBy: auth.session.sub,
        changeDescription: restoreDescription
      });

      return tx.recipe.update({
        where: { id: recipe.id },
        data: {
          raw_content: versionRawContent,
          ...recipeFieldsFromParsed(parsed),
          image_url: restoredImageUrl,
          // A restore is an app edit: mark for conflict tracking, clear any flag.
          app_edited_at: new Date(),
          needs_review: false,
          sync_status: mirror.syncStatus,
          sync_error: mirror.syncError
        }
      });
    });

    log.info(
      { recipeId: updated.id, telegramId, versionId, syncStatus: updated.sync_status },
      'Version restored'
    );

    return Response.json({
      message: 'Version restored successfully',
      title: updated.title,
      details: updated.raw_content,
      image: updated.image_url
    });
  } catch (error) {
    log.error({ error }, 'Failed to restore version');
    return handleApiError(error);
  }
}

/**
 * POST /api/recipes/bulk
 * Bulk AI operations on recipes. Currently: `action: 'parse'`
 * (AI-reformats each recipe's text and re-syncs it).
 *
 * Port of `RecipeService.bulk_parse_recipes` (`routes/recipes.py` /
 * `services/recipe_service.py`). Response shape is Flask's flat
 * `{ processed, failed, total }` (not wrapped in `{ data }`) — the UI reads
 * `result.processed` directly (`RecipeManagement.handleBulkAction`).
 *
 * DB-first / Telegram best-effort per-recipe (ARCHITECTURE §4.3): unlike
 * Flask (which only updates the DB when the Telegram edit succeeds), each
 * recipe's DB write always commits; a mirror failure just marks that recipe
 * `sync_status: 'pending_telegram'` rather than skipping it. A recipe still
 * counts as `failed` only when reformatting itself throws or the recipe is
 * missing required data — never solely because Telegram was unreachable.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VISIBLE_RECIPE } from '@/lib/recipes/visibility';
import { requireEditPermission, authErrorResponse } from '@/lib/auth';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parseBody } from '@/lib/utils/api-validation';
import { reformatRecipe } from '@/lib/services/aiService';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { snapshotVersion } from '@/lib/recipes/versioning';
import { mirrorEditRecipe } from '@/lib/recipes/mirror';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/recipes/bulk:POST' });

interface BulkActionBody {
  action?: string;
  recipeIds?: number[];
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEditPermission(request);
    if (!auth.ok) return authErrorResponse(auth);

    const body = await parseBody<BulkActionBody>(request);
    if (!body?.action || !Array.isArray(body.recipeIds)) {
      throw BadRequestError('Missing required fields');
    }
    if (!body.recipeIds.every((id) => typeof id === 'number')) {
      throw BadRequestError('recipeIds must be a list');
    }
    if (body.action !== 'parse') {
      throw BadRequestError('Invalid action');
    }

    const recipes = await prisma.recipe.findMany({
      where: { ...VISIBLE_RECIPE, id: { in: body.recipeIds } }
    });

    let processed = 0;
    let failed = 0;

    for (const recipe of recipes) {
      try {
        if (!recipe.raw_content || !recipe.telegram_id) {
          log.warn({ recipeId: recipe.id }, 'Recipe missing content or telegram_id — skipped');
          failed++;
          continue;
        }

        const reformattedText = await reformatRecipe(recipe.raw_content);
        const parsed = parseRecipeMessage(reformattedText);

        const mirror = await mirrorEditRecipe({
          telegramId: recipe.telegram_id,
          text: reformattedText,
          hadImage: Boolean(recipe.image_url),
          newImageUrl: null
        });

        await prisma.$transaction(async (tx) => {
          await snapshotVersion(tx, recipe, {
            createdBy: 'AI Parser',
            changeDescription: 'AI Bulk Parse'
          });

          await tx.recipe.update({
            where: { id: recipe.id },
            data: {
              raw_content: reformattedText,
              ...recipeFieldsFromParsed(parsed),
              sync_status: mirror.syncStatus,
              sync_error: mirror.syncError
            }
          });
        });

        processed++;
      } catch (error) {
        log.error({ error, recipeId: recipe.id }, 'Bulk parse failed for recipe');
        failed++;
      }
    }

    log.info({ processed, failed, total: body.recipeIds.length }, 'Bulk parse completed');

    return Response.json({ processed, failed, total: body.recipeIds.length });
  } catch (error) {
    log.error({ error }, 'Bulk action failed');
    return handleApiError(error);
  }
}

/**
 * Bulk AI re-parse — the work behind `POST /api/recipes/bulk`.
 *
 * Each recipe costs a full AI reformat (~7-10s against KIE), a Telegram edit,
 * and a transaction, and they run one at a time to stay inside the provider's
 * rate limits. That makes the batch, not the recipe, the thing that can exceed
 * the function's budget: the route timed out at 15s on a two-recipe batch
 * because it never declared a `maxDuration`, and the client saw only an opaque
 * network error even though the first recipe had already been rewritten.
 *
 * So the loop is bounded by a deadline rather than by hope. When the next
 * recipe would not comfortably fit, it stops and reports `remaining` — the
 * caller re-runs to continue. A partial batch is a normal outcome here, not a
 * failure: every recipe that finished is already committed.
 */
import type { Recipe } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { VISIBLE_RECIPE } from '@/lib/recipes/visibility';
import { reformatRecipe } from '@/lib/services/aiService';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { snapshotVersion } from '@/lib/recipes/versioning';
import { mirrorEditRecipe } from '@/lib/recipes/mirror';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'recipes/bulkParse' });

/**
 * What one recipe is assumed to need. Measured against production: the AI call
 * alone ran 6.2s, and the Telegram edit plus the transaction follow it.
 */
const PER_RECIPE_BUDGET_MS = 25_000;

export interface BulkParseResult {
  processed: number;
  failed: number;
  /** Recipes the deadline left untouched. Re-run with the same ids to finish. */
  remaining: number;
  total: number;
}

/**
 * Reformat one recipe and commit it. Throws; the caller counts the failure.
 *
 * Takes the whole row — `snapshotVersion` records the *previous* content, so
 * it needs every field the version snapshot carries, not just the ones the
 * reformat touches.
 */
async function parseOneRecipe(recipe: Recipe): Promise<void> {
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
}

/**
 * Re-parses each visible recipe in `recipeIds` until `deadline` (an epoch
 * millisecond value) no longer leaves room for another one.
 */
export async function bulkParseRecipes(
  recipeIds: number[],
  deadline: number
): Promise<BulkParseResult> {
  const recipes = await prisma.recipe.findMany({
    where: { ...VISIBLE_RECIPE, id: { in: recipeIds } }
  });

  let processed = 0;
  let failed = 0;
  let index = 0;

  for (const recipe of recipes) {
    if (Date.now() + PER_RECIPE_BUDGET_MS > deadline) {
      const remaining = recipes.length - index;
      log.info({ processed, failed, remaining }, 'Bulk parse stopped at the deadline');
      return { processed, failed, remaining, total: recipeIds.length };
    }
    index++;

    if (!recipe.raw_content || !recipe.telegram_id) {
      log.warn({ recipeId: recipe.id }, 'Recipe missing content or telegram_id — skipped');
      failed++;
      continue;
    }

    try {
      await parseOneRecipe(recipe);
      processed++;
    } catch (error) {
      log.error({ error, recipeId: recipe.id }, 'Bulk parse failed for recipe');
      failed++;
    }
  }

  log.info({ processed, failed, total: recipeIds.length }, 'Bulk parse completed');
  return { processed, failed, remaining: 0, total: recipeIds.length };
}

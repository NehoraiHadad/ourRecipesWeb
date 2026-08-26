/**
 * Bulk AI re-parse — the work behind `POST /api/recipes/bulk`.
 *
 * Each recipe costs a full AI reformat (~7-10s) and a transaction. Two things
 * bound the batch:
 *
 * **The function's budget.** The route timed out at 15s on a two-recipe batch
 * because it never declared a `maxDuration`, and the client saw only an opaque
 * network error even though the first recipe had already been rewritten. So
 * the loop is bounded by a deadline rather than by hope: when the next wave
 * would not comfortably fit, it stops and reports `remaining`, and the caller
 * re-runs to continue. A partial batch is a normal outcome here, not a
 * failure — every recipe that finished is already committed.
 *
 * **Concurrency.** The reformat is a plain synchronous request to KIE's
 * `responses` endpoint (the Jobs API with its task polling is for media, not
 * text), so independent recipes have no reason to wait for each other. There
 * used to be a second constraint here — the Telegram mirror this bulk parse
 * also edited tolerated roughly 20 message edits per minute — but that
 * channel is gone along with the mirror, so `CONCURRENCY` is now bounded only
 * by being a good citizen of the AI provider's own rate limits.
 */
import type { Recipe } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { VISIBLE_RECIPE } from '@/lib/recipes/visibility';
import { reformatRecipe } from '@/lib/services/aiService';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { snapshotVersion } from '@/lib/recipes/versioning';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'recipes/bulkParse' });

/**
 * What one wave is assumed to need. Measured against production: the AI call
 * alone ran 6.2s, and the transaction follows it. A wave runs its recipes
 * together, so this is a per-wave cost, not a per-recipe one.
 */
const WAVE_BUDGET_MS = 25_000;

/**
 * Set by the AI provider, not by Telegram — the mirror this bulk parse used
 * to edit (and its 20-edits/minute channel limit) is gone, so the only
 * remaining bottleneck is being reasonable toward KIE's `responses` endpoint.
 */
const CONCURRENCY = 10;

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

  await prisma.$transaction(async (tx) => {
    await snapshotVersion(tx, recipe, {
      createdBy: 'AI Parser',
      changeDescription: 'AI Bulk Parse'
    });

    await tx.recipe.update({
      where: { id: recipe.id },
      data: {
        raw_content: reformattedText,
        ...recipeFieldsFromParsed(parsed)
      }
    });
  });
}

/**
 * One recipe's whole outcome as a boolean, so a wave never rejects: a single
 * bad recipe must not discard the results of the ones beside it.
 */
async function parseRecipeSafely(recipe: Recipe): Promise<boolean> {
  if (!recipe.raw_content || !recipe.telegram_id) {
    log.warn({ recipeId: recipe.id }, 'Recipe missing content or telegram_id — skipped');
    return false;
  }

  try {
    await parseOneRecipe(recipe);
    return true;
  } catch (error) {
    log.error({ error, recipeId: recipe.id }, 'Bulk parse failed for recipe');
    return false;
  }
}

/**
 * Re-parses each visible recipe in `recipeIds`, `CONCURRENCY` at a time, until
 * `deadline` (an epoch millisecond value) no longer leaves room for a wave.
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

  for (let start = 0; start < recipes.length; start += CONCURRENCY) {
    if (Date.now() + WAVE_BUDGET_MS > deadline) {
      const remaining = recipes.length - start;
      log.info({ processed, failed, remaining }, 'Bulk parse stopped at the deadline');
      return { processed, failed, remaining, total: recipeIds.length };
    }

    const wave = recipes.slice(start, start + CONCURRENCY);
    const outcomes = await Promise.all(wave.map(parseRecipeSafely));

    processed += outcomes.filter(Boolean).length;
    failed += outcomes.filter((ok) => !ok).length;
  }

  log.info({ processed, failed, total: recipeIds.length }, 'Bulk parse completed');
  return { processed, failed, remaining: 0, total: recipeIds.length };
}

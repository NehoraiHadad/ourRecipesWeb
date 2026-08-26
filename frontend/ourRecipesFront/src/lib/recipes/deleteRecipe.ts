/**
 * Recipe deletion (Stage F1) — archives a recipe row.
 *
 * The DB is the only store now that the main Telegram channel is gone, so
 * this is one operation, not a DB-write-plus-best-effort-mirror pair: it
 * either commits `status -> ARCHIVED` or it fails the request outright.
 *
 * The 🗑️ channel-edit convention (`ingest.ts` `isArchiveMarked`) keeps
 * working independently via the webhook — this is just the second, more
 * discoverable way to reach the same `ARCHIVED` state from the management UI.
 */
import { prisma } from '@/lib/prisma';
import { RECIPE_STATUS_ARCHIVED } from '@/lib/recipes/visibility';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'recipes/deleteRecipe' });

/**
 * Archives a recipe: `status -> ARCHIVED`. Callers are responsible for the
 * auth guard and the 404 existence check.
 */
export async function archiveRecipe(recipe: { id: number; telegram_id: number }): Promise<void> {
  await prisma.recipe.update({
    where: { id: recipe.id },
    data: { status: RECIPE_STATUS_ARCHIVED }
  });

  log.info({ recipeId: recipe.id, telegramId: recipe.telegram_id }, 'Recipe archived');
}

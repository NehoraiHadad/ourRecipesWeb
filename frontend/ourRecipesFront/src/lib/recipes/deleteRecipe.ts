/**
 * Recipe deletion (Stage F1) — archives a recipe row and best-effort removes
 * its channel message.
 *
 * Mirrors the DB-first / Telegram-best-effort convention used everywhere
 * else in the app (ARCHITECTURE §4.3, `mirrorMenuDelete`): the row update is
 * the source of truth and always happens; a Telegram failure is logged and
 * swallowed, never thrown.
 *
 * The 🗑️ channel-edit convention (`ingest.ts` `isArchiveMarked`) keeps
 * working independently via the webhook — this is just the second, more
 * discoverable way to reach the same `ARCHIVED` state from the management UI.
 */
import { prisma } from '@/lib/prisma';
import { deleteMessage } from '@/lib/telegram/botApi';
import { getMainChannelId } from '@/lib/telegram/channels';
import { RECIPE_STATUS_ARCHIVED } from '@/lib/recipes/ingest';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'recipes/deleteRecipe' });

/**
 * Best-effort removal of the channel message. Never throws.
 *
 * Skips the Telegram call entirely for placeholder ids (`telegram_id <= 0`,
 * see `generatePendingTelegramId` in `mirror.ts`) — those recipes never had a
 * real channel message, so there is nothing to delete and the call would
 * only fail.
 */
async function mirrorRecipeDelete(telegramId: number): Promise<void> {
  if (telegramId <= 0) return;

  const channelId = getMainChannelId();
  if (channelId === null) return;

  try {
    await deleteMessage({ chat_id: channelId, message_id: telegramId });
  } catch (error) {
    log.warn({ err: error, telegramId }, 'Failed to delete recipe message from Telegram');
  }
}

/**
 * Archives a recipe: best-effort channel message delete, then
 * `status -> ARCHIVED`. Callers are responsible for the auth guard and the
 * 404 existence check.
 */
export async function archiveRecipe(recipe: { id: number; telegram_id: number }): Promise<void> {
  await mirrorRecipeDelete(recipe.telegram_id);

  await prisma.recipe.update({
    where: { id: recipe.id },
    data: { status: RECIPE_STATUS_ARCHIVED }
  });

  log.info({ recipeId: recipe.id, telegramId: recipe.telegram_id }, 'Recipe archived');
}

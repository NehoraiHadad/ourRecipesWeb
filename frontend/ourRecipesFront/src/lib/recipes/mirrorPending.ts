/**
 * Retry of failed outgoing mirrors (ARCHITECTURE §4.3, §4.6).
 *
 * `mirror.ts` is the *forward* path: it tries to publish a recipe the moment
 * the app writes it, and when Telegram is unreachable it parks the row with
 * `sync_status = 'pending_telegram'` (and, for a failed create, a placeholder
 * negative `telegram_id`) rather than failing the user's request. This module
 * is the other half — the sweeper that publishes those rows later, driven by
 * the daily Vercel Cron job and callable on demand through
 * `POST /api/internal/mirror-pending`.
 *
 * Deliberately implemented in TypeScript rather than in the Python function:
 * the mirror is a plain Bot API `sendMessage`, so Python is left with the one
 * job only it can do — reading channel history over MTProto.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendMessage } from '@/lib/telegram/botApi';
import { getMainChannelId } from '@/lib/telegram/channels';
import { formatRecipeText, type RecipeDifficultyValue } from '@/lib/recipes/parser';
import { SYNC_STATUS_PENDING_TELEGRAM, SYNC_STATUS_SYNCED } from '@/lib/recipes/ingest';

const log = logger.child({ context: 'recipes/mirrorPending' });

/** Safety valve — one cron run never tries to publish the whole table. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface MirrorItemResult {
  recipeId: number;
  previousTelegramId: number;
  telegramId?: number;
  ok: boolean;
  error?: string;
}

export interface MirrorPendingResult {
  processed: number;
  mirrored: number;
  failed: number;
  items: MirrorItemResult[];
  /** Set when the run could not even start (no channel configured, etc.). */
  skippedReason?: string;
}

interface PendingRecipe {
  id: number;
  telegram_id: number;
  title: string | null;
  raw_content: string;
  ingredients: string | null;
  instructions: string | null;
  categories: string | null;
  preparation_time: number | null;
  difficulty: RecipeDifficultyValue | null;
}

/**
 * The text to publish. `raw_content` is what the channel is supposed to show,
 * so it wins; the structured fields are only a fallback for rows created
 * through an API path that never composed a message body.
 */
function messageTextFor(recipe: PendingRecipe): string {
  if (recipe.raw_content && recipe.raw_content.trim()) return recipe.raw_content;

  return formatRecipeText({
    title: recipe.title ?? '',
    categories: recipe.categories ? recipe.categories.split(',').filter(Boolean) : [],
    ingredients: recipe.ingredients ? recipe.ingredients.split('||').filter(Boolean) : [],
    instructions: recipe.instructions ?? '',
    preparationTime: recipe.preparation_time ?? undefined,
    difficulty: recipe.difficulty ?? undefined
  });
}

/**
 * Publishes every `pending_telegram` recipe to the main channel and marks it
 * synced.
 *
 * The published message gets a fresh `message_id`, which becomes the recipe's
 * `telegram_id` — replacing the placeholder negative id a failed create left
 * behind. If that id is already taken (the webhook for our own `sendMessage`
 * won the race and claimed the row first), the recipe is simply marked synced
 * under its existing id rather than fighting over the unique constraint.
 *
 * Never throws: a failure on one recipe is recorded and the loop continues.
 */
export async function mirrorPendingRecipes(limit = DEFAULT_LIMIT): Promise<MirrorPendingResult> {
  const take = Math.min(Math.max(1, Math.trunc(limit) || DEFAULT_LIMIT), MAX_LIMIT);

  const mainChannelId = getMainChannelId();
  if (mainChannelId === null) {
    log.error('TELEGRAM_CHANNEL_ID is not configured — cannot mirror pending recipes');
    return {
      processed: 0,
      mirrored: 0,
      failed: 0,
      items: [],
      skippedReason: 'TELEGRAM_CHANNEL_ID is not configured'
    };
  }

  const pending = (await prisma.recipe.findMany({
    where: { sync_status: SYNC_STATUS_PENDING_TELEGRAM },
    select: {
      id: true,
      telegram_id: true,
      title: true,
      raw_content: true,
      ingredients: true,
      instructions: true,
      categories: true,
      preparation_time: true,
      difficulty: true
    },
    orderBy: { updated_at: 'asc' },
    take
  })) as PendingRecipe[];

  if (pending.length === 0) {
    log.debug('No recipes pending a Telegram mirror');
    return { processed: 0, mirrored: 0, failed: 0, items: [] };
  }

  log.info({ count: pending.length }, 'Mirroring pending recipes to the channel');

  const items: MirrorItemResult[] = [];

  for (const recipe of pending) {
    try {
      const sent = await sendMessage({
        chat_id: mainChannelId,
        text: messageTextFor(recipe),
        disable_web_page_preview: true
      });

      try {
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: {
            telegram_id: sent.message_id,
            sync_status: SYNC_STATUS_SYNCED,
            sync_error: null,
            last_sync: new Date()
          }
        });
      } catch (updateError) {
        // Almost certainly a unique-constraint clash on telegram_id, i.e. the
        // webhook for this very message already landed. The content is in the
        // channel either way — just clear the pending flag.
        log.warn(
          { err: updateError, recipeId: recipe.id, messageId: sent.message_id },
          'Could not adopt the new message id — marking synced under the existing id'
        );
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { sync_status: SYNC_STATUS_SYNCED, sync_error: null, last_sync: new Date() }
        });
      }

      items.push({
        recipeId: recipe.id,
        previousTelegramId: recipe.telegram_id,
        telegramId: sent.message_id,
        ok: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ err: error, recipeId: recipe.id }, 'Mirror to Telegram failed — staying pending');

      // Record the reason but keep the row pending so the next run retries it.
      await prisma.recipe
        .update({ where: { id: recipe.id }, data: { sync_error: message.slice(0, 500) } })
        .catch(() => undefined);

      items.push({
        recipeId: recipe.id,
        previousTelegramId: recipe.telegram_id,
        ok: false,
        error: message
      });
    }
  }

  const mirrored = items.filter((item) => item.ok).length;

  log.info(
    { processed: items.length, mirrored, failed: items.length - mirrored },
    'Pending mirror run complete'
  );

  return {
    processed: items.length,
    mirrored,
    failed: items.length - mirrored,
    items
  };
}

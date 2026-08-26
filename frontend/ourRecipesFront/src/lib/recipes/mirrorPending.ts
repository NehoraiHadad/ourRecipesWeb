/**
 * Retry of failed outgoing mirrors (ARCHITECTURE §4.3, §4.6, Stage H1).
 *
 * `mirror.ts` is the *forward* path: it tries to publish a recipe the moment
 * the app writes it (create or edit), and when Telegram is unreachable it
 * parks the row with `sync_status = 'pending_telegram'` — a failed create
 * also leaves a placeholder negative `telegram_id`, a failed edit keeps the
 * existing real one. This module is the sweeper that publishes those rows
 * later: the daily Vercel Cron job, and on demand via
 * `POST /api/internal/mirror-pending`.
 *
 * A pending row's `telegram_id` sign says which retry it needs: negative
 * means "never sent" (`sendMessage`), positive means "sent, but a later edit
 * failed to sync" (edit the existing message via {@link mirrorEditRecipe} —
 * never a second send, which would duplicate it in the channel).
 *
 * TypeScript, not the Python function: the mirror is a plain Bot API call,
 * leaving Python the one job only it can do — reading channel history over
 * MTProto.
 */
import { prisma } from '@/lib/prisma';
import { VISIBLE_RECIPE } from '@/lib/recipes/visibility';
import { logger } from '@/lib/logger';
import { sendMessage } from '@/lib/telegram/botApi';
import { getMainChannelId } from '@/lib/telegram/channels';
import { mirrorEditRecipe } from '@/lib/recipes/mirror';
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

/**
 * What the sweeper needs. `raw_content` is the message body verbatim — it is
 * a NOT NULL column that every write path fills with the channel text, so
 * there is nothing to rebuild from the structured fields here. `image_url`
 * decides whether a pending *edit* retry uses `editMessageCaption` or
 * `editMessageText` (see {@link mirrorEditRecipe}).
 */
interface PendingRecipe {
  id: number;
  telegram_id: number;
  raw_content: string;
  image_url: string | null;
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
    // `VISIBLE_RECIPE` guards a real ordering hazard: a recipe created while
    // Telegram was down, then deleted before the sweeper ran, would otherwise
    // be posted to the channel after the user had already removed it.
    where: { ...VISIBLE_RECIPE, sync_status: SYNC_STATUS_PENDING_TELEGRAM },
    select: { id: true, telegram_id: true, raw_content: true, image_url: true },
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
    items.push(
      recipe.telegram_id > 0
        ? await retryPendingEdit(recipe)
        : await retryPendingCreate(recipe, mainChannelId)
    );
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

/**
 * A pending row that was never sent (negative placeholder `telegram_id`):
 * send it as a brand-new message and adopt the real id. If that id is
 * already taken (the webhook for our own `sendMessage` won the race and
 * claimed the row first), just mark synced under the existing id rather than
 * fighting over the unique constraint.
 */
async function retryPendingCreate(recipe: PendingRecipe, mainChannelId: number): Promise<MirrorItemResult> {
  try {
    const sent = await sendMessage({
      chat_id: mainChannelId,
      text: recipe.raw_content,
      disable_web_page_preview: true
    });

    try {
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { telegram_id: sent.message_id, sync_status: SYNC_STATUS_SYNCED, sync_error: null, last_sync: new Date() }
      });
    } catch (updateError) {
      log.warn(
        { err: updateError, recipeId: recipe.id, messageId: sent.message_id },
        'Could not adopt the new message id — marking synced under the existing id'
      );
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { sync_status: SYNC_STATUS_SYNCED, sync_error: null, last_sync: new Date() }
      });
    }

    return { recipeId: recipe.id, previousTelegramId: recipe.telegram_id, telegramId: sent.message_id, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ err: error, recipeId: recipe.id }, 'Mirror to Telegram failed — staying pending');

    // Record the reason but keep the row pending so the next run retries it.
    await prisma.recipe
      .update({ where: { id: recipe.id }, data: { sync_error: message.slice(0, 500) } })
      .catch(() => undefined);

    return { recipeId: recipe.id, previousTelegramId: recipe.telegram_id, ok: false, error: message };
  }
}

/**
 * A pending row that already has a real message (a later *edit* failed to
 * sync): re-push the current content onto that same message via
 * {@link mirrorEditRecipe} — never `sendMessage`, which would duplicate it.
 */
async function retryPendingEdit(recipe: PendingRecipe): Promise<MirrorItemResult> {
  const mirror = await mirrorEditRecipe({
    telegramId: recipe.telegram_id,
    text: recipe.raw_content,
    hadImage: Boolean(recipe.image_url),
    newImageUrl: null
  });

  const ok = mirror.syncStatus === SYNC_STATUS_SYNCED;
  await prisma.recipe.update({
    where: { id: recipe.id },
    data: { sync_status: mirror.syncStatus, sync_error: mirror.syncError, ...(ok ? { last_sync: new Date() } : {}) }
  });

  return {
    recipeId: recipe.id,
    previousTelegramId: recipe.telegram_id,
    telegramId: ok ? recipe.telegram_id : undefined,
    ok,
    error: mirror.syncError ?? undefined
  };
}

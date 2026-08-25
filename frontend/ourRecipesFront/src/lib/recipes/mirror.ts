/**
 * Best-effort Telegram mirroring for recipe writes (ARCHITECTURE §4.3, Stage H1).
 *
 * DB-first: the caller (`app/api/recipes/route.ts` / `[telegram_id]/route.ts`)
 * always writes the DB row *before* calling into this module, then patches
 * the row afterwards with whatever this module reports. Nothing here talks
 * to Prisma — these are pure "try to tell Telegram" functions that never
 * throw, matching the `menuMirror.ts` pattern. A mirror failure only ever
 * downgrades `sync_status` to `'pending_telegram'`; the periodic reconcile
 * job (`mirrorPending.ts`) is what eventually catches these up.
 */
import {
  editMessageCaption,
  editMessageMedia,
  editMessageText,
  sendMessage,
  sendPhoto
} from '@/lib/telegram/botApi';
import { getMainChannelId } from '@/lib/telegram/channels';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'recipes/mirror' });

export type RecipeSyncStatus = 'synced' | 'pending_telegram';

/**
 * Generates a placeholder `telegram_id` for a recipe whose initial Telegram
 * `sendMessage`/`sendPhoto` failed.
 *
 * `telegram_id` is `NOT NULL UNIQUE` and maps to a Postgres `int4`
 * (max ±2^31), so a millisecond epoch timestamp (~1.7e12) overflows it —
 * this folds `Date.now()` into a 0..999_999_999 window, adds a small random
 * offset to avoid same-millisecond collisions, and negates it (real
 * Telegram message ids are always positive, so a negative id can never
 * collide with a real one). The reconcile job replaces it once the real
 * message id is known.
 */
export function generatePendingTelegramId(): number {
  const base = Date.now() % 1_000_000_000;
  const jitter = Math.floor(Math.random() * 1000);
  return -(base + jitter + 1);
}

/** Is Telegram's "message is not modified" error — treat as a successful no-op. */
function isNotModifiedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('not modified');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface MirrorCreateResult {
  ok: boolean;
  /** The real Telegram message id, present only when `ok` is true. */
  telegramId: number | null;
  error: string | null;
}

/**
 * Sends a brand-new recipe message to the main channel.
 * Port of `RecipeService.create_recipe`'s Telegram half — called *after* the
 * DB row already exists under a placeholder id (Stage H1); the caller patches
 * the row with the result rather than this function touching Prisma.
 */
export async function mirrorCreateRecipe(
  text: string,
  imageBuffer: Buffer | null
): Promise<MirrorCreateResult> {
  try {
    const channelId = getMainChannelId();
    if (channelId === null) {
      throw new Error('TELEGRAM_CHANNEL_ID is not configured');
    }

    const message = imageBuffer
      ? await sendPhoto({ chat_id: channelId, photo: imageBuffer, caption: text })
      : await sendMessage({ chat_id: channelId, text });

    return { ok: true, telegramId: message.message_id, error: null };
  } catch (error) {
    log.error({ err: error }, 'Telegram mirror failed for recipe create — leaving pending_telegram');
    return { ok: false, telegramId: null, error: errorMessage(error) };
  }
}

export interface MirrorEditResult {
  syncStatus: RecipeSyncStatus;
  syncError: string | null;
}

/**
 * Edits an existing recipe message in place.
 * Port of `RecipeService.update_recipe` / `TelegramService.edit_message`.
 *
 * Bot API (unlike Telethon) needs a different method depending on whether
 * the message currently carries a photo and whether the edit changes it:
 *  - no photo, no new image  -> `editMessageText`
 *  - no photo, new image     -> `editMessageMedia` (best-effort: Bot API does
 *    not always allow turning a text message into a photo one; a failure
 *    here just falls through to `pending_telegram` like any other)
 *  - has photo, no new image -> `editMessageCaption` (caption = new text)
 *  - has photo, new image    -> `editMessageMedia` (new photo + caption)
 */
export async function mirrorEditRecipe(params: {
  telegramId: number;
  text: string;
  hadImage: boolean;
  /** New image's Blob URL, or `null` when the image isn't changing. */
  newImageUrl: string | null;
}): Promise<MirrorEditResult> {
  const { telegramId, text, hadImage, newImageUrl } = params;

  try {
    const channelId = getMainChannelId();
    if (channelId === null) {
      throw new Error('TELEGRAM_CHANNEL_ID is not configured');
    }
    if (telegramId <= 0) {
      // Placeholder id from a create whose mirror already failed — there is
      // no real Telegram message to edit yet; reconcile handles this recipe.
      throw new Error('Recipe has no confirmed Telegram message (pending create)');
    }

    if (newImageUrl) {
      await editMessageMedia({
        chat_id: channelId,
        message_id: telegramId,
        media: { type: 'photo', media: newImageUrl, caption: text }
      });
    } else if (hadImage) {
      await editMessageCaption({ chat_id: channelId, message_id: telegramId, caption: text });
    } else {
      await editMessageText({ chat_id: channelId, message_id: telegramId, text });
    }

    return { syncStatus: 'synced', syncError: null };
  } catch (error) {
    if (isNotModifiedError(error)) {
      // Matches RecipeService.update_recipe: Telegram saying "not modified"
      // is not a failure — the channel already reflects this content.
      return { syncStatus: 'synced', syncError: null };
    }

    log.error({ err: error, telegramId }, 'Telegram mirror failed for recipe edit — marking pending_telegram');
    return { syncStatus: 'pending_telegram', syncError: errorMessage(error) };
  }
}

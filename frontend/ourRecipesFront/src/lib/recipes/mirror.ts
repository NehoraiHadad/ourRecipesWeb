/**
 * Best-effort Telegram mirroring for recipe writes (ARCHITECTURE §4.3).
 *
 * The DB is the source of truth: every recipe write commits regardless of
 * whether the channel mirror succeeds. A mirror failure only ever downgrades
 * `sync_status` to `'pending_telegram'` — it never fails the HTTP request.
 * The periodic reconcile job (Wave 1.D / `api-python`) is what eventually
 * catches these up.
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
  telegramId: number;
  syncStatus: RecipeSyncStatus;
  syncError: string | null;
}

/**
 * Sends a brand-new recipe message to the main channel.
 * Port of `RecipeService.create_recipe`'s Telegram half — best-effort here
 * rather than failing the whole create, per ARCHITECTURE §4.3.
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

    return { telegramId: message.message_id, syncStatus: 'synced', syncError: null };
  } catch (error) {
    log.error({ err: error }, 'Telegram mirror failed for recipe create — falling back to pending_telegram');
    return {
      telegramId: generatePendingTelegramId(),
      syncStatus: 'pending_telegram',
      syncError: errorMessage(error)
    };
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

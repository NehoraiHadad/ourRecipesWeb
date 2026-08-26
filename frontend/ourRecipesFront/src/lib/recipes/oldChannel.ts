/**
 * Old-channel intake (ARCHITECTURE §4.1, Wave 5.4).
 *
 * The old channel holds raw, unstructured recipe text — the way people
 * actually write recipes to each other. Gemini reformats the text in memory
 * and the result is stored **directly** in Postgres under a fresh internal
 * `telegram_id`, with the origin recorded as
 * `{source_channel: 'old', source_message_id}`. Nothing is published to any
 * channel — the app is the shop window now.
 *
 * Kept out of `ingest.ts` on purpose: the internal upsert route must not drag
 * the Gemini SDK into its bundle.
 */
import { logger } from '@/lib/logger';
import { reformatRecipe } from '@/lib/services/aiService';
import { generateInternalTelegramId } from '@/lib/recipes/recipeId';
import {
  ARCHIVE_MARKERS,
  ingestRecipeMessage,
  isArchiveMarked,
  stripArchiveMarker,
  SOURCE_CHANNEL_OLD,
  type IngestResult
} from '@/lib/recipes/ingest';

const log = logger.child({ context: 'recipes/oldChannel' });

export interface OldChannelInput {
  /** Message id in the *old* channel — stored as `source_message_id`, so a later edit there can find this row. */
  sourceMessageId: number;
  /** Raw text/caption of the old-channel post. */
  text: string;
  /** Bot API `file_id` of the post's photo (webhook path). */
  photoFileId?: string | null;
  /** Base64 photo bytes (Telethon reconcile/rebuild path — no usable file_id). */
  photoBase64?: string | null;
  /** Original post time, used as `created_at` when the row is first created. */
  messageDate?: Date | null;
}

export interface OldChannelResult {
  /** The internal `telegram_id` the recipe was stored under — the public URL key. */
  telegramId: number;
  ingest: IngestResult;
}

/**
 * The channel text, reformatted — or raw when the AI cannot make a recipe
 * of it.
 *
 * Everything in the old channel is a recipe, however partial: a photographed
 * recipe page with a bare caption, a title-only stub ("פשטידת בטטה"), an
 * ingredient list with no instructions. When the reformat cannot produce a
 * valid recipe, the post stores as-is — unparsed, for the family to complete
 * by hand in the app — instead of being dropped. Only a post with no text
 * *and* no photo has nothing to store.
 *
 * A 🗑️-marked message (ARCHITECTURE §4.4) — seen mostly when the history
 * rebuild replays recipes deleted over the years — is reformatted without
 * the marker, then re-marked so `ingestRecipeMessage` stores it ARCHIVED.
 */
async function reformatOrRaw(
  sourceMessageId: number,
  text: string,
  hasPhoto: boolean
): Promise<string> {
  const stripped = stripArchiveMarker(text).trim();
  if (!stripped) {
    if (hasPhoto) return text;
    throw new Error(`Old-channel message ${sourceMessageId} has no text and no photo`);
  }

  try {
    const formatted = (await reformatRecipe(stripped)).trim();
    if (!formatted) {
      throw new Error(`Gemini returned empty text for old-channel message ${sourceMessageId}`);
    }
    return isArchiveMarked(text) ? `${ARCHIVE_MARKERS[0]} ${formatted}` : formatted;
  } catch (error) {
    log.warn(
      { sourceMessageId, hasPhoto, err: error },
      'Reformat failed — storing the post with its raw text, unparsed'
    );
    return text;
  }
}

/**
 * Reformats an old-channel post and stores it as a recipe row.
 *
 * Callers must first check no row already claims this `sourceMessageId`
 * (`findRecipeByOldChannelSource`) — that is both the edit path and what
 * makes webhook retries idempotent. If two deliveries still race past that
 * check, the `(source_channel, source_message_id)` unique constraint rejects
 * the second insert.
 *
 * AI failure is not fatal — the post stores raw (see `reformatOrRaw`); only
 * a storage/DB error propagates, and the webhook route catches even that and
 * answers 200, because a Telegram retry storm would only replay the failure.
 */
export async function ingestOldChannelPost(input: OldChannelInput): Promise<OldChannelResult> {
  const { sourceMessageId } = input;
  const hasPhoto = Boolean(input.photoFileId || input.photoBase64);

  log.info({ sourceMessageId, chars: input.text.length, hasPhoto }, 'Reformatting old-channel post');

  const text = await reformatOrRaw(sourceMessageId, input.text, hasPhoto);

  const telegramId = generateInternalTelegramId();
  const ingest = await ingestRecipeMessage({
    telegramId,
    source: { channel: SOURCE_CHANNEL_OLD, messageId: sourceMessageId },
    text,
    photoFileId: input.photoFileId ?? null,
    photoBase64: input.photoBase64 ?? null,
    messageDate: input.messageDate ?? null
  });

  log.info(
    { sourceMessageId, telegramId, action: ingest.action },
    'Old-channel post stored as a recipe'
  );

  return { telegramId, ingest };
}

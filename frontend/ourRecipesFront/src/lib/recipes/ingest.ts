/**
 * Recipe ingestion — the one place channel-derived content becomes a row.
 *
 * Both intakes reach this through `ingestOldChannelPost`, with identical
 * semantics so gap-filling can never drift from real-time input
 * (ARCHITECTURE §4.1, §4.2, §4.6):
 *  - `POST /api/webhooks/telegram` — Bot API push from the old channel.
 *  - `POST /api/internal/old-channel/ingest` — the Python (Telethon)
 *    reconcile/rebuild, which the Bot API cannot replace because it cannot
 *    read messages predating the bot.
 *
 * Everything here is idempotent: re-ingesting the same message is a no-op.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { storeTelegramPhoto } from '@/lib/images/blob';
import { storeImageBase64 } from '@/lib/images/upload';
import { RECIPE_STATUS_ACTIVE, RECIPE_STATUS_ARCHIVED } from '@/lib/recipes/visibility';

const log = logger.child({ context: 'recipes/ingest' });

/**
 * Soft-delete convention (ARCHITECTURE §4.4): Telegram never notifies us about
 * a deleted message, so the channel convention is to *edit* the message and
 * prefix it with a wastebasket instead. Both the emoji-presentation form
 * (U+1F5D1 U+FE0F) and the bare code point are accepted.
 */
export const ARCHIVE_MARKERS = ['\u{1F5D1}\u{FE0F}', '\u{1F5D1}'] as const;

/**
 * Whitespace plus the bidi control characters Telegram clients sprinkle in
 * front of RTL text (LRM/RLM, the embedding/override family, BOM) — any of
 * which can sit between the start of the message and the 🗑️ marker.
 */
const LEADING_NOISE = /^[\s\u200E\u200F\u202A-\u202E\uFEFF]+/;

/** `Recipe.source_channel` values — where a row's content originated. */
export const SOURCE_CHANNEL_OLD = 'old';
export const SOURCE_CHANNEL_APP = 'app';

/** Old-channel origin of a message, recorded so later edits there can find the row. */
export interface RecipeSource {
  channel: typeof SOURCE_CHANNEL_OLD;
  /** `message_id` in the old channel. */
  messageId: number;
}

export interface IngestRecipeInput {
  /** Channel `message_id` — the recipe's stable identity (`Recipe.telegram_id`). */
  telegramId: number;
  /**
   * Old-channel origin, when the content was intaken from there. Omitted for
   * app-authored content — the column default (`'app'`) covers that.
   */
  source?: RecipeSource;
  /** `message.text` or `message.caption`. May be empty for a photo-only post. */
  text: string;
  /** Bot API `file_id` of the largest photo size, if the message carries one. */
  photoFileId?: string | null;
  /** Base64 photo bytes (Telethon history reads, which have no usable file_id). */
  photoBase64?: string | null;
  /** Pre-resolved image URL, when the caller already stored the blob. */
  imageUrl?: string | null;
  /** Original post time, used as `created_at` when the row is first created. */
  messageDate?: Date | null;
}

export type IngestAction =
  /** Row did not exist and was created. */
  | 'created'
  /** Row existed and its content changed. */
  | 'updated'
  /** Incoming content is byte-identical to the DB — loop prevention kicked in. */
  | 'unchanged'
  /** Nothing worth storing (empty message, no image, no existing row). */
  | 'skipped';

export interface IngestResult {
  action: IngestAction;
  telegramId: number;
  recipeId?: number;
  status?: string;
  isParsed?: boolean;
  parseErrors?: string[];
  imageUrl?: string | null;
}

/** True when the message text carries the 🗑️ archive marker. */
export function isArchiveMarked(text: string): boolean {
  const head = (text ?? '').replace(LEADING_NOISE, '');
  return ARCHIVE_MARKERS.some((marker) => head.startsWith(marker));
}

/**
 * Removes the archive marker before parsing, so the title of an archived
 * recipe stays readable. `raw_content` still keeps the message verbatim —
 * loop prevention compares against exactly what Telegram sent.
 */
export function stripArchiveMarker(text: string): string {
  const head = (text ?? '').replace(LEADING_NOISE, '');
  for (const marker of ARCHIVE_MARKERS) {
    if (head.startsWith(marker)) {
      return head.slice(marker.length).replace(LEADING_NOISE, '');
    }
  }
  return text ?? '';
}

/** Largest `PhotoSize` of a message — Telegram sends them in ascending order. */
export function largestPhotoFileId(
  photos: Array<{ file_id: string; file_size?: number }> | undefined | null
): string | null {
  if (!photos || photos.length === 0) return null;

  const largest = photos.reduce((best, current) =>
    (current.file_size ?? 0) >= (best.file_size ?? 0) ? current : best
  );

  return largest.file_id ?? photos[photos.length - 1].file_id ?? null;
}

/** Resolves whichever image form the caller supplied into a Blob URL. */
async function resolveImageUrl(input: IngestRecipeInput): Promise<string | null> {
  if (input.imageUrl) return input.imageUrl;
  if (input.photoFileId) return storeTelegramPhoto(input.photoFileId);
  if (input.photoBase64) return storeImageBase64(input.photoBase64, input.telegramId);
  return null;
}

/**
 * Upserts one channel message into `Recipe`, keyed by `telegram_id`.
 *
 * Order of business:
 *  1. **Idempotency** — if the incoming text is identical to `raw_content`
 *     and no new image came with it, stop. Re-delivering or re-scanning the
 *     same message must never rewrite the row.
 *  2. **Archive marker** — a 🗑️ prefix flips `status` to ARCHIVED rather than
 *     deleting the row.
 *  3. **Parse** — best effort; parse failures are recorded, never fatal.
 *  4. **Image** — best effort; a failed upload leaves the old URL untouched.
 */
export async function ingestRecipeMessage(input: IngestRecipeInput): Promise<IngestResult> {
  const { telegramId } = input;
  const text = input.text ?? '';

  const existing = await prisma.recipe.findUnique({
    where: { telegram_id: telegramId },
    select: { id: true, raw_content: true, image_url: true, status: true, source_message_id: true }
  });

  const hasIncomingImage = Boolean(input.imageUrl || input.photoFileId || input.photoBase64);

  // Source fields are set whenever the caller knows them — including on
  // updates, so a row created before its origin was known (e.g. the webhook
  // for our own republished message winning a race) still gets stamped.
  const sourceFields = input.source
    ? { source_channel: input.source.channel, source_message_id: input.source.messageId }
    : {};

  // 1. Loop prevention (ARCHITECTURE §4.2).
  if (existing && existing.raw_content === text && !hasIncomingImage) {
    if (input.source && existing.source_message_id !== input.source.messageId) {
      await prisma.recipe.update({ where: { id: existing.id }, data: sourceFields });
      log.info({ telegramId, source: input.source }, 'Stamped source onto an unchanged recipe');
    }
    log.debug({ telegramId }, 'Incoming content identical to DB — ignoring');
    return {
      action: 'unchanged',
      telegramId,
      recipeId: existing.id,
      status: existing.status,
      imageUrl: existing.image_url
    };
  }

  // Nothing to store: an empty message that does not carry an image and does
  // not correspond to an existing recipe.
  if (!text.trim() && !hasIncomingImage && !existing) {
    log.debug({ telegramId }, 'Empty message with no image — skipping');
    return { action: 'skipped', telegramId };
  }

  // 2. Archive marker (ARCHITECTURE §4.4).
  const archived = isArchiveMarked(text);

  // 3. Parse.
  const parsed = parseRecipeMessage(archived ? stripArchiveMarker(text) : text);

  // 4. Image (best effort — never fails the ingest).
  const imageUrl = await resolveImageUrl(input);

  const data = {
    ...sourceFields,
    raw_content: text,
    ...recipeFieldsFromParsed(parsed),
    status: archived ? RECIPE_STATUS_ARCHIVED : RECIPE_STATUS_ACTIVE,
    // Still meaningful without the outgoing mirror: "last time content
    // arrived from the channel".
    last_sync: new Date(),
    ...(imageUrl ? { image_url: imageUrl, media_type: 'image_url' } : {})
  };

  const recipe = await prisma.recipe.upsert({
    where: { telegram_id: telegramId },
    create: {
      telegram_id: telegramId,
      ...data,
      ...(input.messageDate ? { created_at: input.messageDate } : {})
    },
    update: data,
    select: { id: true, status: true, image_url: true }
  });

  const action: IngestAction = existing ? 'updated' : 'created';

  log.info(
    {
      telegramId,
      recipeId: recipe.id,
      action,
      archived,
      isParsed: parsed.isParsed,
      parseErrorCount: parsed.parseErrors.length,
      hasImage: Boolean(recipe.image_url)
    },
    'Recipe ingested from Telegram'
  );

  return {
    action,
    telegramId,
    recipeId: recipe.id,
    status: recipe.status,
    isParsed: parsed.isParsed,
    parseErrors: parsed.parseErrors,
    imageUrl: recipe.image_url
  };
}

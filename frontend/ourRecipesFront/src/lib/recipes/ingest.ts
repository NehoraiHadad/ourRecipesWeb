/**
 * Recipe ingestion — the one place a Telegram channel message becomes a row.
 *
 * Two callers, identical semantics, so gap-filling can never drift from
 * real-time input (ARCHITECTURE §4.1, §4.2, §4.6):
 *  - `POST /api/webhooks/telegram` — Bot API push, `channel_post` /
 *    `edited_channel_post` on the main channel.
 *  - `POST /api/internal/recipes/upsert` — the Python (Telethon) reconcile and
 *    history importer, which the Bot API cannot replace because it cannot read
 *    messages predating the bot.
 *
 * Everything here is idempotent: re-ingesting the same message is a no-op.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { storeTelegramPhoto } from '@/lib/images/blob';
import { storeImageBase64 } from '@/lib/images/upload';

const log = logger.child({ context: 'recipes/ingest' });

/**
 * `Recipe.status` values.
 *
 * UPPERCASE is the single convention across the app: every consumer compares
 * against `'ACTIVE'` (`/api/recipes/search` filters `status: 'ACTIVE'`,
 * `/api/recipes/manage` validates against `ACTIVE|ARCHIVED|DELETED`), so a row
 * written as lowercase `'active'` would be invisible to the UI. The Prisma
 * column default matches (`@default("ACTIVE")`); ingestion still sets `status`
 * explicitly, since an upsert's update branch never sees a column default.
 */
export const RECIPE_STATUS_ACTIVE = 'ACTIVE';
export const RECIPE_STATUS_ARCHIVED = 'ARCHIVED';

/** `Recipe.sync_status` — outgoing-mirror state only (ARCHITECTURE §8). */
export const SYNC_STATUS_SYNCED = 'synced';
export const SYNC_STATUS_PENDING_TELEGRAM = 'pending_telegram';

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

export interface IngestRecipeInput {
  /** Channel `message_id` — the recipe's stable identity (`Recipe.telegram_id`). */
  telegramId: number;
  /** `message.text` or `message.caption`. May be empty for a photo-only post. */
  text: string;
  /** Bot API `file_id` of the largest photo size, if the message carries one. */
  photoFileId?: string | null;
  /** Base64 photo bytes (Telethon history import, which has no usable file_id). */
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
function stripArchiveMarker(text: string): string {
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
 *  1. **Loop prevention** — if the incoming text is identical to `raw_content`
 *     and no new image came with it, stop. Without this, every mirror write the
 *     app makes would bounce back as an `edited_channel_post` and be rewritten.
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
    select: { id: true, raw_content: true, image_url: true, status: true }
  });

  const hasIncomingImage = Boolean(input.imageUrl || input.photoFileId || input.photoBase64);

  // 1. Loop prevention (ARCHITECTURE §4.2).
  if (existing && existing.raw_content === text && !hasIncomingImage) {
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
    raw_content: text,
    title: parsed.title || null,
    ingredients: parsed.ingredients.join('||'),
    instructions: parsed.instructions || null,
    categories: parsed.categories.join(','),
    difficulty: parsed.difficulty ?? null,
    preparation_time: parsed.preparationTime ?? null,
    is_parsed: parsed.isParsed,
    parse_errors: parsed.parseErrors.join('||'),
    status: archived ? RECIPE_STATUS_ARCHIVED : RECIPE_STATUS_ACTIVE,
    sync_status: SYNC_STATUS_SYNCED,
    sync_error: null,
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

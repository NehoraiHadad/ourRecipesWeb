/**
 * Blob upload for images that did **not** come through the Bot API.
 *
 * `src/lib/images/blob.ts` (Wave 0) covers the webhook path: a Telegram
 * `file_id` → `getFile` → download → Blob. The reconcile/rebuild has no usable
 * `file_id` — it reads the channel with Telethon (MTProto), whose file
 * references the Bot API cannot resolve — so it downloads the photo itself and
 * ships the bytes to `POST /api/internal/old-channel/ingest` as base64.
 *
 * Same contract as `storeTelegramPhoto`: best-effort, never throws, `null` on
 * failure. A missing image must not cost us the recipe.
 */
import { put } from '@vercel/blob';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'images/upload' });

/** Base64 payloads above this decode size are rejected outright (~8MB of bytes). */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Stores a base64-encoded image in Vercel Blob.
 *
 * @param base64 Raw base64, with or without a `data:image/…;base64,` prefix.
 * @param key    Stable name fragment for the blob path (e.g. the message id).
 * @returns Public blob URL, or `null` if the payload was unusable.
 */
export async function storeImageBase64(
  base64: string,
  key: string | number
): Promise<string | null> {
  if (!base64) {
    log.warn({ key }, 'storeImageBase64 called without data');
    return null;
  }

  try {
    // Tolerate a data-URI prefix so callers can pass either form.
    const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
    const buffer = Buffer.from(payload, 'base64');

    if (buffer.length === 0) {
      log.warn({ key }, 'Decoded image is empty');
      return null;
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
      log.warn({ key, bytes: buffer.length }, 'Decoded image exceeds the size limit');
      return null;
    }

    const blob = await put(`recipes/${key}.jpg`, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/jpeg'
    });

    log.info({ key, url: blob.url, bytes: buffer.length }, 'Image stored in Blob');
    return blob.url;
  } catch (error) {
    log.error({ err: error, key }, 'Failed to store base64 image');
    return null;
  }
}

/**
 * Recipe images supplied directly by the client (manual upload, AI-generated
 * suggestion) — as opposed to `lib/images/blob.ts`, which only handles photos
 * that already live on Telegram.
 *
 * Both paths land in the same place (Vercel Blob, `image_url` on `Recipe`),
 * per ARCHITECTURE §5: `image_data Bytes` is retired for new writes.
 */
import { put } from '@vercel/blob';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'recipes/image' });

/**
 * True when `image` is already a stored URL (manual upload used to be the
 * only source of `data:image` payloads; AI generation — Wave 2A — now
 * returns a Blob URL directly). Callers use this to skip decode/upload and
 * store the URL as-is.
 */
export function isHttpsImageUrl(image: unknown): image is string {
  return typeof image === 'string' && image.startsWith('https://');
}

/**
 * Decodes a `data:image/<type>;base64,<data>` string into a `Buffer`.
 *
 * Port of `_process_image_data` (`backend/ourRecipesBack/routes/recipes.py`):
 * anything that isn't a non-empty string starting with `data:image` is
 * treated as "no image", matching the Python function's `None` return.
 */
export function decodeBase64Image(image: unknown): Buffer | null {
  if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
    return null;
  }

  const marker = ';base64,';
  const markerIndex = image.indexOf(marker);
  if (markerIndex === -1) return null;

  const base64 = image.slice(markerIndex + marker.length);
  if (!base64) return null;

  try {
    return Buffer.from(base64, 'base64');
  } catch (error) {
    log.warn({ err: error }, 'Failed to decode base64 recipe image');
    return null;
  }
}

/**
 * Uploads a freshly-supplied recipe image to Vercel Blob and returns its
 * public URL.
 *
 * Best-effort by design, same contract as `storeTelegramPhoto`: an image
 * must never fail a recipe write, so every failure resolves to `null` after
 * being logged.
 */
export async function uploadRecipeImage(buffer: Buffer, keyHint: string): Promise<string | null> {
  try {
    const blob = await put(`recipes/${keyHint}.jpg`, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/jpeg'
    });

    log.info({ url: blob.url, bytes: buffer.length }, 'Recipe image stored in Blob');
    return blob.url;
  } catch (error) {
    log.error({ err: error }, 'Failed to upload recipe image to Blob');
    return null;
  }
}

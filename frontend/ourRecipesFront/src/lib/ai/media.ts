/**
 * Copies AI-generated media (KIE result URLs) into Vercel Blob.
 *
 * KIE retains generated files for 14 days only and its temporary download
 * links expire after 20 minutes (`docs/architecture/KIE_INTEGRATION_RESEARCH.md`
 * §2, "Retention קריטי") — every result must be copied to our own storage
 * immediately, before the route returns.
 *
 * Unlike `lib/images/blob.ts` / `lib/images/upload.ts` (best-effort, resolve
 * to `null`), this throws on failure: callers here are AI-generation flows
 * that must decide their own fallback (e.g. degrade to direct Gemini).
 */
import { put } from '@vercel/blob';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'ai/media' });

/**
 * Sanity cap, deliberately above `lib/images/upload.ts`'s 8MiB: a 2K
 * GPT Image 2 PNG (the infographic task) measures ~10MB, and rejecting it
 * here fails the whole generation after the credits were already spent.
 */
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

/** HTTP timeout for fetching the source (KIE-hosted) image. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetches a KIE result URL and stores it in Vercel Blob.
 *
 * @param url     Public, temporary result URL returned by `pollTaskResult`.
 * @param keyHint Stable name fragment for the blob path (e.g. recipe id).
 * @returns The permanent public Blob URL.
 * @throws If the fetch fails, the image is empty/oversized, or the Blob upload fails.
 */
export async function storeGeneratedImage(url: string, keyHint: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    log.error({ err: error, url, keyHint }, 'Failed to fetch generated image');
    throw new Error(`Failed to fetch generated image from ${url}`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new Error('Generated image is empty');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Generated image exceeds the ${MAX_IMAGE_BYTES}-byte limit (${buffer.length} bytes)`);
  }

  const blob = await put(`recipes/${keyHint}.jpg`, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'image/jpeg'
  });

  log.info({ keyHint, url: blob.url, bytes: buffer.length }, 'Generated image stored in Blob');
  return blob.url;
}

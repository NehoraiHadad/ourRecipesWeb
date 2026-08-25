/**
 * Recipe images — Telegram → Vercel Blob.
 *
 * The DB stores only the resulting URL (ARCHITECTURE §5), never the bytes.
 */
import { put } from '@vercel/blob';
import { downloadFile, getFile } from '@/lib/telegram/botApi';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'images/blob' });

/**
 * Downloads a Telegram photo and stores it in Vercel Blob.
 *
 * Best-effort by design: a missing image must never fail a webhook or a recipe
 * write, so every failure resolves to `null` after being logged.
 *
 * @param fileId `file_id` of the largest `PhotoSize` of the message.
 * @returns Public blob URL, or `null` if anything went wrong.
 */
export async function storeTelegramPhoto(fileId: string): Promise<string | null> {
  if (!fileId) {
    log.warn('storeTelegramPhoto called without a fileId');
    return null;
  }

  try {
    const file = await getFile(fileId);

    if (!file.file_path) {
      log.warn({ fileId }, 'getFile returned no file_path');
      return null;
    }

    const buffer = await downloadFile(file.file_path);

    const blob = await put(`recipes/${fileId}.jpg`, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/jpeg'
    });

    log.info({ fileId, url: blob.url, bytes: buffer.length }, 'Telegram photo stored in Blob');
    return blob.url;
  } catch (error) {
    log.error({ err: error, fileId }, 'Failed to store Telegram photo');
    return null;
  }
}

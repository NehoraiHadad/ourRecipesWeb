/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storeTelegramPhoto } from '@/lib/images/blob';
import { downloadFile, getFile, TelegramApiError } from '@/lib/telegram/botApi';
import { put } from '@vercel/blob';

vi.mock('@/lib/telegram/botApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/telegram/botApi')>(
    '@/lib/telegram/botApi'
  );
  return {
    ...actual,
    getFile: vi.fn(),
    downloadFile: vi.fn()
  };
});

vi.mock('@vercel/blob', () => ({
  put: vi.fn()
}));

const getFileMock = vi.mocked(getFile);
const downloadFileMock = vi.mocked(downloadFile);
const putMock = vi.mocked(put);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storeTelegramPhoto', () => {
  it('resolves, downloads and uploads the photo, returning the blob URL', async () => {
    getFileMock.mockResolvedValue({
      file_id: 'FILE_1',
      file_unique_id: 'U1',
      file_path: 'photos/file_1.jpg'
    });
    const buffer = Buffer.from('image-bytes');
    downloadFileMock.mockResolvedValue(buffer);
    putMock.mockResolvedValue({
      url: 'https://blob.vercel-storage.com/recipes/FILE_1-abc.jpg'
    } as any);

    const url = await storeTelegramPhoto('FILE_1');

    expect(url).toBe('https://blob.vercel-storage.com/recipes/FILE_1-abc.jpg');
    expect(getFileMock).toHaveBeenCalledWith('FILE_1');
    expect(downloadFileMock).toHaveBeenCalledWith('photos/file_1.jpg');
    expect(putMock).toHaveBeenCalledWith(
      'recipes/FILE_1.jpg',
      buffer,
      expect.objectContaining({ access: 'public', addRandomSuffix: true })
    );
  });

  it('returns null when no fileId is given', async () => {
    await expect(storeTelegramPhoto('')).resolves.toBeNull();
    expect(getFileMock).not.toHaveBeenCalled();
  });

  it('returns null when getFile returns no file_path', async () => {
    getFileMock.mockResolvedValue({ file_id: 'FILE_1', file_unique_id: 'U1' });

    await expect(storeTelegramPhoto('FILE_1')).resolves.toBeNull();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('returns null (never throws) when getFile fails', async () => {
    getFileMock.mockRejectedValue(
      new TelegramApiError({ method: 'getFile', error_code: 400, description: 'file not found' })
    );

    await expect(storeTelegramPhoto('FILE_1')).resolves.toBeNull();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('returns null when the download fails', async () => {
    getFileMock.mockResolvedValue({
      file_id: 'FILE_1',
      file_unique_id: 'U1',
      file_path: 'photos/file_1.jpg'
    });
    downloadFileMock.mockRejectedValue(new Error('network down'));

    await expect(storeTelegramPhoto('FILE_1')).resolves.toBeNull();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('returns null when the blob upload fails', async () => {
    getFileMock.mockResolvedValue({
      file_id: 'FILE_1',
      file_unique_id: 'U1',
      file_path: 'photos/file_1.jpg'
    });
    downloadFileMock.mockResolvedValue(Buffer.from('x'));
    putMock.mockRejectedValue(new Error('BLOB_READ_WRITE_TOKEN missing'));

    await expect(storeTelegramPhoto('FILE_1')).resolves.toBeNull();
  });
});

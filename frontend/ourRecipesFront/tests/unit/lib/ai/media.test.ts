/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storeGeneratedImage } from '@/lib/ai/media';
import { put } from '@vercel/blob';

vi.mock('@vercel/blob', () => ({ put: vi.fn() }));

const fetchMock = vi.mocked(global.fetch);
const putMock = vi.mocked(put);

beforeEach(() => {
  vi.clearAllMocks();
});

function bufferResponse(bytes: number, ok = true, status = 200): Response {
  const buffer = new Uint8Array(bytes).buffer;
  return {
    ok,
    status,
    arrayBuffer: async () => buffer
  } as unknown as Response;
}

describe('storeGeneratedImage', () => {
  it('fetches the KIE result URL and uploads it to Blob, returning the public URL', async () => {
    fetchMock.mockResolvedValue(bufferResponse(1024));
    putMock.mockResolvedValue({ url: 'https://blob.vercel-storage.com/recipes/r1-abc.jpg' } as any);

    const url = await storeGeneratedImage('https://kie.ai/result.jpg', 'r1');

    expect(url).toBe('https://blob.vercel-storage.com/recipes/r1-abc.jpg');
    expect(putMock).toHaveBeenCalledWith(
      'recipes/r1.jpg',
      expect.any(Buffer),
      expect.objectContaining({ access: 'public', addRandomSuffix: true, contentType: 'image/jpeg' })
    );
  });

  it('throws when the source fetch fails', async () => {
    fetchMock.mockResolvedValue(bufferResponse(0, false, 404));

    await expect(storeGeneratedImage('https://kie.ai/gone.jpg', 'r1')).rejects.toThrow(/404/);
    expect(putMock).not.toHaveBeenCalled();
  });

  it('throws when the fetched image is empty', async () => {
    fetchMock.mockResolvedValue(bufferResponse(0));

    await expect(storeGeneratedImage('https://kie.ai/empty.jpg', 'r1')).rejects.toThrow(/empty/);
    expect(putMock).not.toHaveBeenCalled();
  });

  it('throws when the fetched image exceeds the size limit', async () => {
    fetchMock.mockResolvedValue(bufferResponse(17 * 1024 * 1024));

    await expect(storeGeneratedImage('https://kie.ai/huge.jpg', 'r1')).rejects.toThrow(/exceeds/);
    expect(putMock).not.toHaveBeenCalled();
  });

  it('propagates the Blob upload error', async () => {
    fetchMock.mockResolvedValue(bufferResponse(1024));
    putMock.mockRejectedValue(new Error('BLOB_READ_WRITE_TOKEN missing'));

    await expect(storeGeneratedImage('https://kie.ai/result.jpg', 'r1')).rejects.toThrow(
      'BLOB_READ_WRITE_TOKEN missing'
    );
  });
});

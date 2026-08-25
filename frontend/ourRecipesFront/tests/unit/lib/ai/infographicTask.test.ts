/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ai/kie', () => ({
  createTask: vi.fn(),
  pollTaskResult: vi.fn(),
  getKieImageModel: vi.fn(() => 'nano-banana-2'),
  getKieInfographicModel: vi.fn(() => 'nano-banana-pro'),
  kieImageInput: vi.fn((prompt: string, options?: Record<string, unknown>) => ({ prompt, ...options }))
}));

vi.mock('@/lib/ai/media', () => ({
  storeGeneratedImage: vi.fn()
}));

vi.mock('@/lib/recipes/image', () => ({
  uploadRecipeImage: vi.fn()
}));

const generateContentMock = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function (this: { models: { generateContent: typeof generateContentMock } }) {
    this.models = { generateContent: generateContentMock };
  })
}));

import { createTask, pollTaskResult } from '@/lib/ai/kie';
import { storeGeneratedImage } from '@/lib/ai/media';
import { uploadRecipeImage } from '@/lib/recipes/image';
import { generateRecipeInfographic } from '@/lib/ai/infographicTask';

const createTaskMock = vi.mocked(createTask);
const pollTaskResultMock = vi.mocked(pollTaskResult);
const storeGeneratedImageMock = vi.mocked(storeGeneratedImage);
const uploadRecipeImageMock = vi.mocked(uploadRecipeImage);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_API_KEY = 'test-key';
  delete process.env.GOOGLE_API_KEY_NANO_BANANA;
});

describe('generateRecipeInfographic', () => {
  it('returns the Blob URL from the KIE happy path', async () => {
    createTaskMock.mockResolvedValue({ taskId: 'T1' });
    pollTaskResultMock.mockResolvedValue(['https://kie.ai/infographic.jpg']);
    storeGeneratedImageMock.mockResolvedValue('https://blob.vercel-storage.com/recipes/infographic-T1-abc.jpg');

    const url = await generateRecipeInfographic('כותרת: עוגה');

    expect(url).toBe('https://blob.vercel-storage.com/recipes/infographic-T1-abc.jpg');
    expect(createTaskMock).toHaveBeenCalledWith('nano-banana-pro', expect.objectContaining({ prompt: expect.any(String) }));
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('falls back to direct Gemini and uploads its output to Blob when KIE fails', async () => {
    createTaskMock.mockRejectedValue(new Error('KIE createTask failed'));
    generateContentMock.mockResolvedValue({ data: 'QUJD' });
    uploadRecipeImageMock.mockResolvedValue('https://blob.vercel-storage.com/recipes/infographic-fallback-abc.jpg');

    const url = await generateRecipeInfographic('כותרת: עוגה');

    expect(url).toBe('https://blob.vercel-storage.com/recipes/infographic-fallback-abc.jpg');
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3-pro-image-preview' })
    );
    expect(uploadRecipeImageMock).toHaveBeenCalledWith(expect.any(Buffer), expect.stringContaining('infographic-fallback-'));
  });

  it('throws when both KIE and the Gemini fallback fail', async () => {
    createTaskMock.mockRejectedValue(new Error('KIE down'));
    generateContentMock.mockResolvedValue({ data: undefined });

    await expect(generateRecipeInfographic('כותרת: עוגה')).rejects.toThrow(/No image generated/);
  });
});

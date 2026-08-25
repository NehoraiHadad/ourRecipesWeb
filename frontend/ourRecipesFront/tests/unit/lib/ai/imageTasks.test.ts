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

import { createTask, pollTaskResult } from '@/lib/ai/kie';
import { storeGeneratedImage } from '@/lib/ai/media';
import { generateRecipeImage } from '@/lib/ai/imageTasks';

const createTaskMock = vi.mocked(createTask);
const pollTaskResultMock = vi.mocked(pollTaskResult);
const storeGeneratedImageMock = vi.mocked(storeGeneratedImage);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateRecipeImage', () => {
  it('creates a KIE task from the recipe title, polls it, and stores the result in Blob', async () => {
    createTaskMock.mockResolvedValue({ taskId: 'T1' });
    pollTaskResultMock.mockResolvedValue(['https://kie.ai/result.jpg']);
    storeGeneratedImageMock.mockResolvedValue('https://blob.vercel-storage.com/recipes/image-T1-abc.jpg');

    const url = await generateRecipeImage('כותרת: עוגת שוקולד\nרשימת מצרכים:\n- קמח');

    expect(url).toBe('https://blob.vercel-storage.com/recipes/image-T1-abc.jpg');
    expect(createTaskMock).toHaveBeenCalledWith(
      'nano-banana-2',
      expect.objectContaining({ prompt: expect.stringContaining('עוגת שוקולד'), outputResolution: '2k' })
    );
    expect(pollTaskResultMock).toHaveBeenCalledWith('T1');
    expect(storeGeneratedImageMock).toHaveBeenCalledWith('https://kie.ai/result.jpg', 'image-T1');
  });

  it('never falls back to a generic "dish" placeholder — uses the first 100 chars when no title is found', async () => {
    createTaskMock.mockResolvedValue({ taskId: 'T2' });
    pollTaskResultMock.mockResolvedValue(['https://kie.ai/result2.jpg']);
    storeGeneratedImageMock.mockResolvedValue('https://blob.vercel-storage.com/recipes/image-T2-abc.jpg');

    const content = 'x'.repeat(150);
    await generateRecipeImage(content);

    const [, input] = createTaskMock.mock.calls[0] as [string, { prompt: string }];
    expect(input.prompt).not.toContain('dish');
    expect(input.prompt).toContain('x'.repeat(100));
    expect(input.prompt).not.toContain('x'.repeat(101));
  });

  it('throws when the KIE task succeeds with no result URL', async () => {
    createTaskMock.mockResolvedValue({ taskId: 'T3' });
    pollTaskResultMock.mockResolvedValue([]);

    await expect(generateRecipeImage('כותרת: עוגה')).rejects.toThrow(/no result URL/);
    expect(storeGeneratedImageMock).not.toHaveBeenCalled();
  });
});

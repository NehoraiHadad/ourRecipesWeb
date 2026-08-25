// @vitest-environment node
/**
 * Integration tests for POST /api/recipes/generate-image (Wave 2A: KIE
 * `gpt-image-2-text-to-image` via `aiService`, response carries a Blob `image_url`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/aiService', () => ({
  generateRecipeImage: vi.fn()
}));

import { generateRecipeImage } from '@/lib/services/aiService';
import { POST } from '@/app/api/recipes/generate-image/route';

const generateRecipeImageMock = vi.mocked(generateRecipeImage);

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/recipes/generate-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } as any);
}

beforeEach(() => {
  generateRecipeImageMock.mockReset();
});

describe('POST /api/recipes/generate-image', () => {
  it('rejects a body with no recipeContent', async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
    expect(generateRecipeImageMock).not.toHaveBeenCalled();
  });

  it('returns the Blob URL from the AI service as image_url', async () => {
    generateRecipeImageMock.mockResolvedValue('https://blob.vercel-storage.com/recipes/image-abc.jpg');

    const response = await POST(postRequest({ recipeContent: 'כותרת: עוגה\nרשימת מצרכים:\n- קמח' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.image_url).toBe('https://blob.vercel-storage.com/recipes/image-abc.jpg');
    expect(generateRecipeImageMock).toHaveBeenCalledWith('כותרת: עוגה\nרשימת מצרכים:\n- קמח');
  });

  it('propagates a failure from the AI service as an error response', async () => {
    generateRecipeImageMock.mockRejectedValue(new Error('KIE task failed'));

    const response = await POST(postRequest({ recipeContent: 'כותרת: עוגה' }));

    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});

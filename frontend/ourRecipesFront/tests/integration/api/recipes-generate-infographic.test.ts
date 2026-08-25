// @vitest-environment node
/**
 * Integration tests for POST /api/recipes/generate-infographic (Wave 2A:
 * response now carries a Blob `image_url`, not a `data:` URI).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, requireAuth: vi.fn() };
});

vi.mock('@/lib/services/aiService', () => ({
  generateRecipeInfographic: vi.fn()
}));

import { requireAuth } from '@/lib/auth';
import { generateRecipeInfographic } from '@/lib/services/aiService';
import { POST } from '@/app/api/recipes/generate-infographic/route';

const requireAuthMock = vi.mocked(requireAuth);
const generateRecipeInfographicMock = vi.mocked(generateRecipeInfographic);

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/recipes/generate-infographic'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } as any);
}

beforeEach(() => {
  requireAuthMock.mockReset();
  generateRecipeInfographicMock.mockReset();
  requireAuthMock.mockResolvedValue({
    ok: true,
    session: { sub: '111', type: 'telegram', permissions: { can_edit: true } }
  } as any);
});

describe('POST /api/recipes/generate-infographic', () => {
  it('requires authentication', async () => {
    requireAuthMock.mockResolvedValue({ ok: false, status: 401, message: 'No authentication token found' });

    const response = await POST(postRequest({ recipeContent: 'כותרת: עוגה' }));
    expect(response.status).toBe(401);
    expect(generateRecipeInfographicMock).not.toHaveBeenCalled();
  });

  it('rejects a body with no recipeContent', async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns the Blob URL from the AI service as image_url', async () => {
    generateRecipeInfographicMock.mockResolvedValue('https://blob.vercel-storage.com/recipes/infographic-abc.jpg');

    const response = await POST(postRequest({ recipeContent: 'כותרת: עוגה' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.image_url).toBe('https://blob.vercel-storage.com/recipes/infographic-abc.jpg');
  });

  it('propagates a failure from the AI service as an error response', async () => {
    generateRecipeInfographicMock.mockRejectedValue(new Error('KIE and Gemini both failed'));

    const response = await POST(postRequest({ recipeContent: 'כותרת: עוגה' }));

    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});

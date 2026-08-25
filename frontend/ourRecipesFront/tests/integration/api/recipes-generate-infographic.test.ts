// @vitest-environment node
/**
 * Integration tests for POST /api/recipes/generate-infographic (Wave 1.B).
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

  it('returns a data:image/png;base64 URI built from the AI service output', async () => {
    generateRecipeInfographicMock.mockResolvedValue('QUJD');

    const response = await POST(postRequest({ recipeContent: 'כותרת: עוגה' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.image).toBe('data:image/png;base64,QUJD');
  });
});

// @vitest-environment node
/**
 * Wave 1.D — the machine-to-machine surface: `/api/internal/*` and
 * `/api/cron/reconcile`.
 *
 * These routes are exempt from the JWT middleware, so their bearer-secret guard
 * is the *only* thing between the Python function's credentials and the
 * database. Every one of them is checked here for fail-closed behaviour.
 *
 * The `mirror-pending` sweep and the cron's mirror phase were removed along
 * with the outgoing Telegram mirror (Wave 5.4b) — the main channel this used
 * to publish to is gone. What is left of the machine-to-machine surface is
 * strictly inbound: the Python reconcile job hands the app channel messages
 * through `upsert`, reads `summary` to know what it can skip, and the cron
 * just pokes that job to run.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

vi.mock('@/lib/images/upload', () => ({
  storeImageBase64: vi.fn()
}));

import { POST as upsertPOST } from '@/app/api/internal/recipes/upsert/route';
import { GET as summaryGET } from '@/app/api/internal/recipes/summary/route';
import { GET as cronGET } from '@/app/api/cron/reconcile/route';
import { storeImageBase64 } from '@/lib/images/upload';

const INTERNAL_SECRET = 'internal-secret-value';
const CRON_SECRET = 'cron-secret-value';

const RECIPE_TEXT = [
  'כותרת: מרק עדשים',
  'קטגוריות: מרקים',
  'זמן הכנה: 30 דקות',
  'רמת קושי: קל',
  'רשימת מצרכים:',
  '- כוס עדשים',
  'הוראות הכנה:',
  'מבשלים הכל יחד.'
].join('\n');

function internalRequest(
  path: string,
  options: { method?: string; body?: any; token?: string | null } = {}
) {
  const { method = 'GET', body, token = INTERNAL_SECRET } = options;

  return createMockRequest(`http://localhost:3000${path}`, {
    method,
    body,
    headers: token === null ? {} : { Authorization: `Bearer ${token}` }
  });
}

describe('Internal + cron routes', () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.mocked(storeImageBase64).mockReset();

    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
    delete process.env.PYTHON_RECONCILE_URL;
  });

  describe('POST /api/internal/recipes/upsert', () => {
    it('rejects a request with no bearer token', async () => {
      const response = await upsertPOST(
        internalRequest('/api/internal/recipes/upsert', {
          method: 'POST',
          body: { telegram_id: 1, text: RECIPE_TEXT },
          token: null
        })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('rejects a request with the wrong bearer token', async () => {
      const response = await upsertPOST(
        internalRequest('/api/internal/recipes/upsert', {
          method: 'POST',
          body: { telegram_id: 1, text: RECIPE_TEXT },
          token: 'wrong'
        })
      );

      expect(response.status).toBe(401);
    });

    it('fails closed when INTERNAL_API_SECRET is unset', async () => {
      delete process.env.INTERNAL_API_SECRET;

      const response = await upsertPOST(
        internalRequest('/api/internal/recipes/upsert', {
          method: 'POST',
          body: { telegram_id: 1, text: RECIPE_TEXT },
          token: null
        })
      );

      expect(response.status).toBe(401);
    });

    it('runs the same ingest the webhook runs', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      prismaMock.recipe.upsert.mockResolvedValue({
        id: 3,
        status: 'ACTIVE',
        image_url: null
      } as any);

      const response = await upsertPOST(
        internalRequest('/api/internal/recipes/upsert', {
          method: 'POST',
          body: { telegram_id: 77, text: RECIPE_TEXT, date: '2024-03-01T10:00:00.000Z' }
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'created', telegram_id: 77, recipe_id: 3 });

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.where).toEqual({ telegram_id: 77 });
      expect(call.create.title).toBe('מרק עדשים');
      expect(call.create.status).toBe('ACTIVE');
      expect(call.create.created_at).toEqual(new Date('2024-03-01T10:00:00.000Z'));
    });

    it('stores a base64 photo from the history importer', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      prismaMock.recipe.upsert.mockResolvedValue({
        id: 4,
        status: 'ACTIVE',
        image_url: 'https://blob.example/recipes/77.jpg'
      } as any);
      vi.mocked(storeImageBase64).mockResolvedValue('https://blob.example/recipes/77.jpg');

      const response = await upsertPOST(
        internalRequest('/api/internal/recipes/upsert', {
          method: 'POST',
          body: { telegram_id: 77, text: RECIPE_TEXT, photo_base64: 'AAAA' }
        })
      );

      expect(response.status).toBe(200);
      expect(storeImageBase64).toHaveBeenCalledWith('AAAA', 77);

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.create.image_url).toBe('https://blob.example/recipes/77.jpg');
    });

    it('is idempotent — identical content is a no-op', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue({
        id: 3,
        raw_content: RECIPE_TEXT,
        image_url: null,
        status: 'ACTIVE'
      } as any);

      const response = await upsertPOST(
        internalRequest('/api/internal/recipes/upsert', {
          method: 'POST',
          body: { telegram_id: 77, text: RECIPE_TEXT }
        })
      );

      const json = await parseJsonResponse<any>(response);
      expect(json.action).toBe('unchanged');
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('rejects a body without a usable telegram_id', async () => {
      const response = await upsertPOST(
        internalRequest('/api/internal/recipes/upsert', {
          method: 'POST',
          body: { text: RECIPE_TEXT }
        })
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/internal/recipes/summary', () => {
    it('requires a bearer token', async () => {
      const response = await summaryGET(
        internalRequest('/api/internal/recipes/summary?ids=1,2', { token: null })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
    });

    it('returns a SHA-256 of raw_content per requested id, plus its channel origin', async () => {
      const { createHash } = await import('crypto');
      const expectedHash = createHash('sha256').update(RECIPE_TEXT, 'utf8').digest('hex');

      prismaMock.recipe.findMany.mockResolvedValue([
        {
          telegram_id: 77,
          raw_content: RECIPE_TEXT,
          image_url: null,
          status: 'ACTIVE',
          source_channel: 'old',
          source_message_id: 77,
          updated_at: new Date('2026-08-25T09:00:00.000Z')
        }
      ] as any);

      const response = await summaryGET(
        internalRequest('/api/internal/recipes/summary?ids=77,78')
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.count).toBe(1);
      expect(json.recipes[0]).toMatchObject({
        telegram_id: 77,
        content_hash: expectedHash,
        status: 'ACTIVE',
        source_channel: 'old',
        source_message_id: 77,
        has_image: false
      });

      const where = (prismaMock.recipe.findMany.mock.calls[0][0] as any).where;
      expect(where.telegram_id).toEqual({ in: [77, 78] });
    });
  });

  describe('GET /api/cron/reconcile', () => {
    it('rejects an unauthenticated call', async () => {
      const response = await cronGET(
        internalRequest('/api/cron/reconcile', { token: null })
      );

      expect(response.status).toBe(401);
    });

    it('accepts the Vercel CRON_SECRET', async () => {
      const response = await cronGET(
        internalRequest('/api/cron/reconcile', { token: CRON_SECRET })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ok).toBe(true);
      // No PYTHON_RECONCILE_URL configured — the history pass is skipped, not failed.
      expect(json.reconcile).toMatchObject({ triggered: false, reason: 'not_configured' });
    });

    it('also accepts INTERNAL_API_SECRET for manual runs', async () => {
      const response = await cronGET(
        internalRequest('/api/cron/reconcile', { token: INTERNAL_SECRET })
      );

      expect(response.status).toBe(200);
    });

    it('triggers the Python reconcile when PYTHON_RECONCILE_URL is set', async () => {
      process.env.PYTHON_RECONCILE_URL = 'https://recipes-python.vercel.app';

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, checked: 12 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      try {
        const response = await cronGET(
          internalRequest('/api/cron/reconcile', { token: CRON_SECRET })
        );

        expect(response.status).toBe(200);
        const json = await parseJsonResponse<any>(response);
        expect(json.reconcile).toMatchObject({ triggered: true, status: 200 });

        // Base URL is accepted; `/reconcile` is appended.
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://recipes-python.vercel.app/reconcile');
        expect((init as RequestInit).headers).toMatchObject({
          Authorization: `Bearer ${INTERNAL_SECRET}`
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('still succeeds when the Python function is unreachable', async () => {
      process.env.PYTHON_RECONCILE_URL = 'https://recipes-python.vercel.app/reconcile';

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      try {
        const response = await cronGET(
          internalRequest('/api/cron/reconcile', { token: CRON_SECRET })
        );

        expect(response.status).toBe(200);
        const json = await parseJsonResponse<any>(response);
        expect(json.ok).toBe(true);
        expect(json.reconcile.triggered).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});

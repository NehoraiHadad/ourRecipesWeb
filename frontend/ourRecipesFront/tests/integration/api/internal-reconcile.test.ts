// @vitest-environment node
/**
 * The machine-to-machine surface: `/api/internal/recipes/summary` and
 * `/api/cron/reconcile`.
 *
 * These routes are exempt from the JWT middleware, so their bearer-secret
 * guard is the *only* thing between the Python function's credentials and the
 * database — both are checked here for fail-closed behaviour.
 *
 * Since Wave 5 the summary route answers exactly one question: which of the
 * given old-channel message ids already have a row (matched by the
 * `{source_channel:'old', source_message_id}` pair — never by `telegram_id`,
 * which is an unrelated internal id). The write door for misses is
 * `/api/internal/old-channel/ingest`, tested in its own file.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

import { GET as summaryGET } from '@/app/api/internal/recipes/summary/route';
import { GET as cronGET } from '@/app/api/cron/reconcile/route';

const INTERNAL_SECRET = 'internal-secret-value';
const CRON_SECRET = 'cron-secret-value';

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

    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
    delete process.env.PYTHON_RECONCILE_URL;
  });

  describe('GET /api/internal/recipes/summary', () => {
    it('requires a bearer token', async () => {
      const response = await summaryGET(
        internalRequest('/api/internal/recipes/summary?source_ids=1,2', { token: null })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
    });

    it('rejects a request without source_ids', async () => {
      const response = await summaryGET(internalRequest('/api/internal/recipes/summary'));

      expect(response.status).toBe(400);
      expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
    });

    it('answers which old-channel message ids already have a row', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        {
          source_message_id: 42,
          telegram_id: -900123,
          image_url: 'https://blob.example/r.jpg',
          status: 'ACTIVE',
          updated_at: new Date('2026-08-25T09:00:00.000Z')
        }
      ] as any);

      const response = await summaryGET(
        internalRequest('/api/internal/recipes/summary?source_ids=42,43')
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      // 43 is absent from the answer — that's the reconcile's miss signal.
      expect(json.count).toBe(1);
      expect(json.recipes[0]).toMatchObject({
        source_message_id: 42,
        telegram_id: -900123,
        status: 'ACTIVE',
        has_image: true
      });

      const where = (prismaMock.recipe.findMany.mock.calls[0][0] as any).where;
      expect(where).toEqual({ source_channel: 'old', source_message_id: { in: [42, 43] } });
    });

    it('treats source_ids with no valid id as an empty question', async () => {
      const response = await summaryGET(
        internalRequest('/api/internal/recipes/summary?source_ids=abc,-1')
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, count: 0, recipes: [] });
      expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
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

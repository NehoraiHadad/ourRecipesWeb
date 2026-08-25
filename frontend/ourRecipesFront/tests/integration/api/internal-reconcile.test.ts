// @vitest-environment node
/**
 * Wave 1.D — the machine-to-machine surface: `/api/internal/*` and
 * `/api/cron/reconcile`.
 *
 * These routes are exempt from the JWT middleware, so their bearer-secret guard
 * is the *only* thing between the Python function's credentials and the
 * database. Every one of them is checked here for fail-closed behaviour.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

vi.mock('@/lib/telegram/botApi', () => ({
  sendMessage: vi.fn()
}));
vi.mock('@/lib/images/blob', () => ({
  storeTelegramPhoto: vi.fn()
}));
vi.mock('@/lib/images/upload', () => ({
  storeImageBase64: vi.fn()
}));

import { POST as upsertPOST } from '@/app/api/internal/recipes/upsert/route';
import { GET as summaryGET } from '@/app/api/internal/recipes/summary/route';
import { POST as mirrorPendingPOST } from '@/app/api/internal/mirror-pending/route';
import { GET as cronGET } from '@/app/api/cron/reconcile/route';
import { sendMessage } from '@/lib/telegram/botApi';
import { storeImageBase64 } from '@/lib/images/upload';

const INTERNAL_SECRET = 'internal-secret-value';
const CRON_SECRET = 'cron-secret-value';
const MAIN_CHANNEL_ID = -1001111111111;

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
    vi.mocked(sendMessage).mockReset();
    vi.mocked(storeImageBase64).mockReset();

    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.TELEGRAM_CHANNEL_ID = String(MAIN_CHANNEL_ID);
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

    it('returns a SHA-256 of raw_content per requested id', async () => {
      const { createHash } = await import('crypto');
      const expectedHash = createHash('sha256').update(RECIPE_TEXT, 'utf8').digest('hex');

      prismaMock.recipe.findMany.mockResolvedValue([
        {
          telegram_id: 77,
          raw_content: RECIPE_TEXT,
          image_url: null,
          status: 'ACTIVE',
          sync_status: 'synced',
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
        has_image: false
      });

      const where = (prismaMock.recipe.findMany.mock.calls[0][0] as any).where;
      expect(where.telegram_id).toEqual({ in: [77, 78] });
    });
  });

  describe('POST /api/internal/mirror-pending', () => {
    it('requires a bearer token', async () => {
      const response = await mirrorPendingPOST(
        internalRequest('/api/internal/mirror-pending', { method: 'POST', token: null })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
    });

    it('publishes pending recipes and adopts the new message id', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        {
          id: 9,
          telegram_id: -12345,
          title: 'מרק עדשים',
          raw_content: RECIPE_TEXT,
          ingredients: 'כוס עדשים',
          instructions: 'מבשלים הכל יחד.',
          categories: 'מרקים',
          preparation_time: 30,
          difficulty: 'EASY'
        }
      ] as any);
      prismaMock.recipe.update.mockResolvedValue({ id: 9 } as any);
      vi.mocked(sendMessage).mockResolvedValue({
        message_id: 4242,
        chat: { id: MAIN_CHANNEL_ID, type: 'channel' },
        date: 1,
        text: RECIPE_TEXT
      } as any);

      const response = await mirrorPendingPOST(
        internalRequest('/api/internal/mirror-pending', { method: 'POST', body: { limit: 5 } })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, processed: 1, mirrored: 1, failed: 0 });

      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ chat_id: MAIN_CHANNEL_ID, text: RECIPE_TEXT })
      );

      const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
      expect(updateArgs.where).toEqual({ id: 9 });
      expect(updateArgs.data.telegram_id).toBe(4242);
      expect(updateArgs.data.sync_status).toBe('synced');
    });

    it('keeps a recipe pending when Telegram is still down', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        {
          id: 9,
          telegram_id: -12345,
          title: 'מרק עדשים',
          raw_content: RECIPE_TEXT,
          ingredients: null,
          instructions: null,
          categories: null,
          preparation_time: null,
          difficulty: null
        }
      ] as any);
      prismaMock.recipe.update.mockResolvedValue({ id: 9 } as any);
      vi.mocked(sendMessage).mockRejectedValue(new Error('Bad Gateway'));

      const response = await mirrorPendingPOST(
        internalRequest('/api/internal/mirror-pending', { method: 'POST' })
      );

      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, processed: 1, mirrored: 0, failed: 1 });

      // Only sync_error is written — the row stays pending for the next run.
      const updateArgs = prismaMock.recipe.update.mock.calls[0][0] as any;
      expect(updateArgs.data).toEqual({ sync_error: 'Bad Gateway' });
    });
  });

  describe('GET /api/cron/reconcile', () => {
    it('rejects an unauthenticated call', async () => {
      const response = await cronGET(
        internalRequest('/api/cron/reconcile', { token: null })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
    });

    it('accepts the Vercel CRON_SECRET and runs the mirror phase', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([] as any);

      const response = await cronGET(
        internalRequest('/api/cron/reconcile', { token: CRON_SECRET })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ok).toBe(true);
      expect(json.mirror).toMatchObject({ processed: 0, mirrored: 0 });
      // No PYTHON_RECONCILE_URL configured — the history pass is skipped, not failed.
      expect(json.reconcile).toMatchObject({ triggered: false, reason: 'not_configured' });
      expect(prismaMock.recipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sync_status: 'pending_telegram' } })
      );
    });

    it('also accepts INTERNAL_API_SECRET for manual runs', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([] as any);

      const response = await cronGET(
        internalRequest('/api/cron/reconcile', { token: INTERNAL_SECRET })
      );

      expect(response.status).toBe(200);
    });

    it('triggers the Python reconcile when PYTHON_RECONCILE_URL is set', async () => {
      process.env.PYTHON_RECONCILE_URL = 'https://recipes-python.vercel.app';
      prismaMock.recipe.findMany.mockResolvedValue([] as any);

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
      prismaMock.recipe.findMany.mockResolvedValue([] as any);

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

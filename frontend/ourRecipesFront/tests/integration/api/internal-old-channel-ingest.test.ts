// @vitest-environment node
/**
 * `POST /api/internal/old-channel/ingest` (Wave 5.5).
 *
 * The Telethon reconcile/rebuild function's only way to run the old-channel
 * pipeline: given a channel message the DB is missing (or one whose row it
 * already tracks), reformat with Gemini and create/update the recipe. Same
 * lookup-then-branch as the webhook, but — unlike the webhook — failures here
 * must not be swallowed into a 200, because the caller can and should retry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

vi.mock('@/lib/services/aiService', () => ({
  reformatRecipe: vi.fn()
}));
vi.mock('@/lib/images/upload', () => ({
  storeImageBase64: vi.fn()
}));

import { POST as ingestPOST } from '@/app/api/internal/old-channel/ingest/route';
import { reformatRecipe } from '@/lib/services/aiService';
import { storeImageBase64 } from '@/lib/images/upload';

const INTERNAL_SECRET = 'internal-secret-value';

const RECIPE_TEXT = [
  'כותרת: עוגת שוקולד',
  'קטגוריות: קינוחים, עוגות',
  'זמן הכנה: 45 דקות',
  'רמת קושי: קל',
  'רשימת מצרכים:',
  '- 200 גרם שוקולד',
  '- 3 ביצים',
  'הוראות הכנה:',
  'ממיסים את השוקולד.',
  'מקפלים פנימה את הביצים.'
].join('\n');

function ingestRequest(body: Record<string, unknown>, options: { secret?: string | null } = {}) {
  const { secret = INTERNAL_SECRET } = options;

  return createMockRequest('http://localhost:3000/api/internal/old-channel/ingest', {
    method: 'POST',
    body,
    headers: secret === null ? {} : { Authorization: `Bearer ${secret}` }
  });
}

/** The row `findRecipeByOldChannelSource` returns for a tracked message. */
function trackedRecipe(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    telegram_id: -900123,
    title: 'עוגת שוקולד',
    raw_content: RECIPE_TEXT,
    categories: 'קינוחים',
    ingredients_list: [],
    instructions: 'ממיסים.',
    preparation_time: 45,
    difficulty: 'EASY',
    image_url: null,
    status: 'ACTIVE',
    app_edited_at: null,
    ...overrides
  };
}

function mockUpsertResult(overrides: Record<string, unknown> = {}) {
  prismaMock.recipe.upsert.mockResolvedValue({
    id: 7,
    status: 'ACTIVE',
    image_url: null,
    ...overrides
  } as any);
}

describe('POST /api/internal/old-channel/ingest', () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.mocked(reformatRecipe).mockReset();
    vi.mocked(storeImageBase64).mockReset();
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
  });

  describe('authentication', () => {
    it('rejects a request with no bearer token', async () => {
      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 42, text: 'raw text' }, { secret: null })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a request with the wrong bearer token', async () => {
      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 42, text: 'raw text' }, { secret: 'nope' })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('rejects a non-JSON body', async () => {
      const request = createMockRequest('http://localhost:3000/api/internal/old-channel/ingest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${INTERNAL_SECRET}` }
      });
      // No body at all — request.json() throws.
      const response = await ingestPOST(request);
      expect(response.status).toBe(400);
    });

    it('rejects a missing sourceMessageId', async () => {
      const response = await ingestPOST(ingestRequest({ text: 'raw text' }));
      expect(response.status).toBe(400);
      const json = await parseJsonResponse<any>(response);
      expect(json.ok).toBe(false);
    });

    it('rejects a non-positive sourceMessageId', async () => {
      const response = await ingestPOST(ingestRequest({ sourceMessageId: -5, text: 'raw text' }));
      expect(response.status).toBe(400);
    });

    it('rejects empty text when no photo is attached', async () => {
      const response = await ingestPOST(ingestRequest({ sourceMessageId: 42, text: '   ' }));
      expect(response.status).toBe(400);
      expect(reformatRecipe).not.toHaveBeenCalled();
    });

    it('rejects a missing text field when no photo is attached', async () => {
      const response = await ingestPOST(ingestRequest({ sourceMessageId: 42 }));
      expect(response.status).toBe(400);
    });
  });

  describe('photo-first posts (a photographed recipe, completed by hand)', () => {
    it('stores a photo-only post without calling the AI', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ id: 13, image_url: 'https://blob.example/p.jpg' });
      vi.mocked(storeImageBase64).mockResolvedValue('https://blob.example/p.jpg');

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 45, text: '', photoBase64: 'AAAA' })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'created', recipeId: 13 });
      expect(reformatRecipe).not.toHaveBeenCalled();
      expect(storeImageBase64).toHaveBeenCalledWith('AAAA', expect.any(Number));
    });

    it('answers unchanged for a photo-only message a row already claims', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(trackedRecipe() as any);

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 46, text: '', photoBase64: 'AAAA' })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'unchanged', telegram_id: -900123 });
      expect(reformatRecipe).not.toHaveBeenCalled();
      expect(prismaMock.recipe.update).not.toHaveBeenCalled();
    });

    it('falls back to the raw caption when the AI cannot make a recipe of it', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ id: 14, image_url: 'https://blob.example/p.jpg' });
      vi.mocked(storeImageBase64).mockResolvedValue('https://blob.example/p.jpg');
      vi.mocked(reformatRecipe).mockRejectedValue(
        new Error('AI returned an invalid recipe for task "reformat"')
      );

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 47, text: 'עוגת שמרים של סבתא', photoBase64: 'AAAA' })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'created', recipeId: 14 });

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.create.raw_content).toBe('עוגת שמרים של סבתא');
    });
  });

  describe('create path (miss)', () => {
    it('reformats with Gemini and stores a new recipe under an internal id', async () => {
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT);
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ id: 11 });

      const response = await ingestPOST(
        ingestRequest({
          sourceMessageId: 42,
          text: 'עוגת שוקולד של סבתא, שוקולד וביצים, לערבב ולאפות',
          date: 1_700_000_800
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'created', recipeId: 11 });
      // Stored under a generated internal id — the public URL key.
      expect(json.telegram_id).toBeLessThan(0);

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.where.telegram_id).toBeLessThan(0);
      expect(call.create.raw_content).toBe(RECIPE_TEXT);
      expect(call.create.source_channel).toBe('old');
      expect(call.create.source_message_id).toBe(42);
      // Original post time (unix seconds) becomes created_at.
      expect(call.create.created_at).toEqual(new Date(1_700_000_800 * 1000));
    });

    it('stores a base64 photo shipped by the Telethon reconcile', async () => {
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT);
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ id: 12, image_url: 'https://blob.example/r.jpg' });
      vi.mocked(storeImageBase64).mockResolvedValue('https://blob.example/r.jpg');

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 43, text: 'מתכון עם תמונה', photoBase64: 'AAAA' })
      );

      expect(response.status).toBe(200);
      expect(storeImageBase64).toHaveBeenCalledWith('AAAA', expect.any(Number));

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.create.image_url).toBe('https://blob.example/r.jpg');
    });
  });

  describe('edit path (hit)', () => {
    beforeEach(() => {
      (prismaMock.$transaction as any).mockImplementation((cb: any) => cb(prismaMock));
      prismaMock.recipeVersion.findMany.mockResolvedValue([]);
      prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: 2 } } as any);
    });

    it('updates the matching row and passes needs_review through', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(
        trackedRecipe({ app_edited_at: new Date('2026-08-20') }) as any
      );
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT.replace('45', '50'));

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 44, text: 'גרסה ערוכה של המתכון' })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({
        ok: true,
        action: 'updated',
        telegram_id: -900123,
        recipeId: 11,
        needs_review: true
      });

      expect(prismaMock.recipe.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            source_channel_source_message_id: { source_channel: 'old', source_message_id: 44 }
          }
        })
      );
      expect(prismaMock.recipeVersion.create).toHaveBeenCalledTimes(1);
    });

    it('reports unchanged when the edit reformats to the exact stored content', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(trackedRecipe() as any);
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT);

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 44, text: 'אותו תוכן, ניסוח גולמי' })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'unchanged', needs_review: false });
      expect(prismaMock.recipe.update).not.toHaveBeenCalled();
      expect(prismaMock.recipeVersion.create).not.toHaveBeenCalled();
    });
  });

  describe('AI failure', () => {
    it('stores the raw text instead of failing — channel content is never dropped', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ id: 18 });
      vi.mocked(reformatRecipe).mockRejectedValue(new Error('Gemini unavailable'));

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 42, text: 'פשטידת בטטה' })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'created', recipeId: 18 });

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.create.raw_content).toBe('פשטידת בטטה');
    });

    it('answers 5xx when the DB lookup itself fails', async () => {
      prismaMock.recipe.findUnique.mockRejectedValue(new Error('Connection refused'));

      const response = await ingestPOST(
        ingestRequest({ sourceMessageId: 42, text: 'raw text' })
      );

      expect(response.status).toBe(500);
      const json = await parseJsonResponse<any>(response);
      expect(json.ok).toBe(false);
    });
  });
});

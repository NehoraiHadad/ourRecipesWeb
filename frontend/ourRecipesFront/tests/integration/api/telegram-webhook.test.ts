// @vitest-environment node
/**
 * `POST /api/webhooks/telegram` (Wave 5.4).
 *
 * The webhook is the only unauthenticated-by-middleware entry point in the app,
 * so its decision table is pinned here: who gets in (secret token), what counts
 * as ours (channel id), and what an old-channel post/edit does to the DB. The
 * main channel is frozen — posts there are acknowledged and ignored.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

vi.mock('@/lib/services/aiService', () => ({
  reformatRecipe: vi.fn()
}));

import { POST as webhookPOST } from '@/app/api/webhooks/telegram/route';
import { reformatRecipe } from '@/lib/services/aiService';

const WEBHOOK_SECRET = 'webhook-secret-value';
const MAIN_CHANNEL_ID = -1001111111111;
const OLD_CHANNEL_ID = -1002222222222;

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

/** Builds a webhook delivery. */
function webhookRequest(
  update: Record<string, unknown>,
  options: { secret?: string | null } = {}
) {
  const { secret = WEBHOOK_SECRET } = options;

  return createMockRequest('http://localhost:3000/api/webhooks/telegram', {
    method: 'POST',
    body: update,
    headers: secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }
  });
}

function oldChannelMessage(overrides: Record<string, unknown> = {}) {
  return {
    message_id: 42,
    chat: { id: OLD_CHANNEL_ID, type: 'channel', title: 'Old' },
    date: 1_700_000_800,
    text: 'עוגת שוקולד של סבתא, שוקולד וביצים, לערבב ולאפות',
    ...overrides
  };
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
    app_edited_at: null,
    ...overrides
  };
}

/** Prisma `upsert` returns the row the route echoes back. */
function mockUpsertResult(overrides: Record<string, unknown> = {}) {
  prismaMock.recipe.upsert.mockResolvedValue({
    id: 7,
    status: 'ACTIVE',
    image_url: null,
    ...overrides
  } as any);
}

describe('POST /api/webhooks/telegram', () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.mocked(reformatRecipe).mockReset();

    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.TELEGRAM_CHANNEL_ID = String(MAIN_CHANNEL_ID);
    process.env.TELEGRAM_OLD_CHANNEL_ID = String(OLD_CHANNEL_ID);
  });

  describe('authentication', () => {
    it('rejects a delivery with the wrong secret token', async () => {
      const response = await webhookPOST(
        webhookRequest({ update_id: 1, channel_post: oldChannelMessage() }, { secret: 'nope' })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('rejects a delivery with no secret token at all', async () => {
      const response = await webhookPOST(
        webhookRequest({ update_id: 1, channel_post: oldChannelMessage() }, { secret: null })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('rejects everything when the secret is not configured (fail closed)', async () => {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;

      const response = await webhookPOST(
        webhookRequest({ update_id: 1, channel_post: oldChannelMessage() })
      );

      expect(response.status).toBe(401);
    });
  });

  describe('update filtering', () => {
    it('ignores updates that are not channel posts', async () => {
      const response = await webhookPOST(
        webhookRequest({
          update_id: 2,
          message: { message_id: 1, chat: { id: 123, type: 'private' }, date: 1, text: 'hi' }
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ok).toBe(true);
      expect(json.ignored).toBe('unsupported_update');
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('ignores a post from an unknown chat', async () => {
      const response = await webhookPOST(
        webhookRequest({
          update_id: 3,
          channel_post: oldChannelMessage({ chat: { id: -1009999999999, type: 'channel' } })
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ignored).toBe('unknown_chat');
      expect(prismaMock.recipe.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('ignores posts on the frozen main channel', async () => {
      const response = await webhookPOST(
        webhookRequest({
          update_id: 4,
          channel_post: {
            message_id: 501,
            chat: { id: MAIN_CHANNEL_ID, type: 'channel', title: 'Main' },
            date: 1_700_000_000,
            text: RECIPE_TEXT
          }
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ignored).toBe('main_channel_frozen');
      expect(prismaMock.recipe.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
      expect(reformatRecipe).not.toHaveBeenCalled();
    });
  });

  describe('old channel — new posts', () => {
    it('reformats with Gemini and stores directly under an internal id', async () => {
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT);
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ id: 11 });

      const response = await webhookPOST(
        webhookRequest({ update_id: 9, channel_post: oldChannelMessage() })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({
        ok: true,
        source: 'old_channel',
        edited: false,
        sourceMessageId: 42,
        action: 'created'
      });
      // Stored under a generated internal id — the public URL key.
      expect(json.telegram_id).toBeLessThan(0);

      expect(reformatRecipe).toHaveBeenCalledWith(oldChannelMessage().text);

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.where.telegram_id).toBeLessThan(0);
      expect(call.create.raw_content).toBe(RECIPE_TEXT);
      expect(call.create.title).toBe('עוגת שוקולד');
      expect(call.create.source_channel).toBe('old');
      expect(call.create.source_message_id).toBe(42);
      // Original post time becomes created_at.
      expect(call.create.created_at).toEqual(new Date(1_700_000_800 * 1000));
    });

    it('ignores an empty post', async () => {
      const response = await webhookPOST(
        webhookRequest({ update_id: 9, channel_post: oldChannelMessage({ text: '   ' }) })
      );

      const json = await parseJsonResponse<any>(response);
      expect(json.ignored).toBe('old_channel_empty');
      expect(reformatRecipe).not.toHaveBeenCalled();
    });

    it('still answers 200 when Gemini fails, so Telegram does not retry forever', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      vi.mocked(reformatRecipe).mockRejectedValue(new Error('Gemini unavailable'));

      const response = await webhookPOST(
        webhookRequest({ update_id: 10, channel_post: oldChannelMessage() })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ok).toBe(true);
      expect(json.error).toBe('processing_failed');
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('treats a redelivered post as an edit of the row it created (idempotency)', async () => {
      // Second delivery of message 42: the source lookup finds the row, the
      // reformat comes out identical, nothing is written.
      prismaMock.recipe.findUnique.mockResolvedValue(trackedRecipe() as any);
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT);

      const response = await webhookPOST(
        webhookRequest({ update_id: 9, channel_post: oldChannelMessage() })
      );

      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ action: 'unchanged', telegram_id: -900123 });
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
      expect(prismaMock.recipe.update).not.toHaveBeenCalled();
    });
  });

  describe('old channel — edits', () => {
    function oldChannelEdit(text: string) {
      return webhookRequest({
        update_id: 11,
        edited_channel_post: oldChannelMessage({ message_id: 44, text })
      });
    }

    beforeEach(() => {
      (prismaMock.$transaction as any).mockImplementation((cb: any) => cb(prismaMock));
      prismaMock.recipeVersion.findMany.mockResolvedValue([]);
      prismaMock.recipeVersion.aggregate.mockResolvedValue({ _max: { version_num: 2 } } as any);
    });

    it('updates the matching row: reformat, snapshot, overwrite', async () => {
      const editedFormatted = RECIPE_TEXT.replace('עוגת שוקולד', 'עוגת שוקולד מריר');
      prismaMock.recipe.findUnique.mockResolvedValue(trackedRecipe() as any);
      vi.mocked(reformatRecipe).mockResolvedValue(editedFormatted);

      const response = await webhookPOST(oldChannelEdit('גרסה ערוכה של המתכון'));

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({
        ok: true,
        source: 'old_channel',
        edited: true,
        sourceMessageId: 44,
        telegram_id: -900123,
        action: 'updated',
        needs_review: false
      });

      // Matched by the source pair, never by telegram_id.
      expect(prismaMock.recipe.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            source_channel_source_message_id: { source_channel: 'old', source_message_id: 44 }
          }
        })
      );

      // Previous content snapshotted, row overwritten with the reformat.
      expect(prismaMock.recipeVersion.create).toHaveBeenCalledTimes(1);
      const versionData = (prismaMock.recipeVersion.create.mock.calls[0][0] as any).data;
      expect(versionData.created_by).toBe('old_channel');
      expect((versionData.content as any).raw_content).toBe(RECIPE_TEXT);

      const update = prismaMock.recipe.update.mock.calls.at(-1)![0] as any;
      expect(update.where).toEqual({ id: 11 });
      expect(update.data.raw_content).toBe(editedFormatted);
      expect(update.data.title).toBe('עוגת שוקולד מריר');
      expect(update.data.needs_review).toBeUndefined();
    });

    it('flags a row that was also edited in the app (channel wins, review requested)', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(
        trackedRecipe({ app_edited_at: new Date('2026-08-20') }) as any
      );
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT.replace('45', '50'));

      const response = await webhookPOST(oldChannelEdit('גרסה ערוכה'));

      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ action: 'updated', needs_review: true });

      const update = prismaMock.recipe.update.mock.calls.at(-1)![0] as any;
      expect(update.data.needs_review).toBe(true);
    });

    it('no-ops when the edit reformats to the exact stored content', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(trackedRecipe() as any);
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT);

      const response = await webhookPOST(oldChannelEdit('אותו תוכן, ניסוח גולמי'));

      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ action: 'unchanged' });
      expect(prismaMock.recipe.update).not.toHaveBeenCalled();
      expect(prismaMock.recipeVersion.create).not.toHaveBeenCalled();
    });

    it('treats an edit no row claims as a brand-new post', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      vi.mocked(reformatRecipe).mockResolvedValue(RECIPE_TEXT);
      mockUpsertResult({ id: 12 });

      const response = await webhookPOST(oldChannelEdit('מתכון מלפני המעקב, עכשיו ערוך'));

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ source: 'old_channel', edited: true, action: 'created' });
      expect(json.telegram_id).toBeLessThan(0);

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.create.source_channel).toBe('old');
      expect(call.create.source_message_id).toBe(44);
    });
  });

  it('answers 200 when the DB is down, rather than inviting a retry storm', async () => {
    prismaMock.recipe.findUnique.mockRejectedValue(new Error('Connection refused'));

    const response = await webhookPOST(
      webhookRequest({ update_id: 12, channel_post: oldChannelMessage() })
    );

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.error).toBe('processing_failed');
  });
});

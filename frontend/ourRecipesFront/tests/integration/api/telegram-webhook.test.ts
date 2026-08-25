// @vitest-environment node
/**
 * Wave 1.D — `POST /api/webhooks/telegram`.
 *
 * The webhook is the only unauthenticated-by-middleware entry point in the app,
 * so its decision table is pinned here: who gets in (secret token), what counts
 * as ours (channel id), and what each kind of channel post does to the DB.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

// Wave 0 libs the route leans on — mocked so no network/Blob/Gemini is touched.
vi.mock('@/lib/images/blob', () => ({
  storeTelegramPhoto: vi.fn()
}));
vi.mock('@/lib/telegram/botApi', () => ({
  sendMessage: vi.fn()
}));
vi.mock('@/lib/services/aiService', () => ({
  reformatRecipe: vi.fn()
}));

import { POST as webhookPOST } from '@/app/api/webhooks/telegram/route';
import { storeTelegramPhoto } from '@/lib/images/blob';
import { sendMessage } from '@/lib/telegram/botApi';
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

function channelPost(overrides: Record<string, unknown> = {}) {
  return {
    message_id: 501,
    chat: { id: MAIN_CHANNEL_ID, type: 'channel', title: 'Main' },
    date: 1_700_000_000,
    text: RECIPE_TEXT,
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
    vi.mocked(storeTelegramPhoto).mockReset();
    vi.mocked(sendMessage).mockReset();
    vi.mocked(reformatRecipe).mockReset();

    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.TELEGRAM_CHANNEL_ID = String(MAIN_CHANNEL_ID);
    process.env.TELEGRAM_OLD_CHANNEL_ID = String(OLD_CHANNEL_ID);
  });

  describe('authentication', () => {
    it('rejects a delivery with the wrong secret token', async () => {
      const response = await webhookPOST(
        webhookRequest({ update_id: 1, channel_post: channelPost() }, { secret: 'nope' })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('rejects a delivery with no secret token at all', async () => {
      const response = await webhookPOST(
        webhookRequest({ update_id: 1, channel_post: channelPost() }, { secret: null })
      );

      expect(response.status).toBe(401);
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('rejects everything when the secret is not configured (fail closed)', async () => {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;

      const response = await webhookPOST(
        webhookRequest({ update_id: 1, channel_post: channelPost() })
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
          channel_post: channelPost({ chat: { id: -1009999999999, type: 'channel' } })
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ignored).toBe('unknown_chat');
      expect(prismaMock.recipe.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });
  });

  describe('main channel', () => {
    it('creates a recipe from a new channel post', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult();

      const response = await webhookPOST(
        webhookRequest({ update_id: 4, channel_post: channelPost() })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'created', telegram_id: 501 });

      expect(prismaMock.recipe.upsert).toHaveBeenCalledTimes(1);
      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;

      expect(call.where).toEqual({ telegram_id: 501 });
      expect(call.create.telegram_id).toBe(501);
      expect(call.create.title).toBe('עוגת שוקולד');
      expect(call.create.raw_content).toBe(RECIPE_TEXT);
      // '||'-separated ingredients, comma-separated categories (Flask convention).
      expect(call.create.ingredients).toBe('200 גרם שוקולד||3 ביצים');
      expect(call.create.categories).toBe('קינוחים,עוגות');
      expect(call.create.preparation_time).toBe(45);
      expect(call.create.difficulty).toBe('EASY');
      expect(call.create.is_parsed).toBe(true);
      expect(call.create.parse_errors).toBe('');
      expect(call.create.status).toBe('ACTIVE');
      expect(call.create.sync_status).toBe('synced');
    });

    it('updates an existing recipe on edited_channel_post', async () => {
      const editedText = RECIPE_TEXT.replace('עוגת שוקולד', 'עוגת שוקולד מריר');

      prismaMock.recipe.findUnique.mockResolvedValue({
        id: 7,
        raw_content: RECIPE_TEXT,
        image_url: null,
        status: 'ACTIVE'
      } as any);
      mockUpsertResult();

      const response = await webhookPOST(
        webhookRequest({
          update_id: 5,
          edited_channel_post: channelPost({ text: editedText, edit_date: 1_700_000_500 })
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({ ok: true, action: 'updated', edited: true, telegram_id: 501 });

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.update.raw_content).toBe(editedText);
      expect(call.update.title).toBe('עוגת שוקולד מריר');
    });

    it('no-ops when the incoming text is identical to the DB (loop prevention)', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue({
        id: 7,
        raw_content: RECIPE_TEXT,
        image_url: null,
        status: 'ACTIVE'
      } as any);

      const response = await webhookPOST(
        webhookRequest({ update_id: 6, edited_channel_post: channelPost() })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.action).toBe('unchanged');
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('archives a recipe whose message was prefixed with 🗑️', async () => {
      const archivedText = `🗑️ ${RECIPE_TEXT}`;

      prismaMock.recipe.findUnique.mockResolvedValue({
        id: 7,
        raw_content: RECIPE_TEXT,
        image_url: null,
        status: 'ACTIVE'
      } as any);
      mockUpsertResult({ status: 'ARCHIVED' });

      const response = await webhookPOST(
        webhookRequest({
          update_id: 7,
          edited_channel_post: channelPost({ text: archivedText })
        })
      );

      expect(response.status).toBe(200);

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.update.status).toBe('ARCHIVED');
      // The message is stored verbatim so the next identical edit is a no-op…
      expect(call.update.raw_content).toBe(archivedText);
      // …but the marker is stripped before parsing, so the title stays clean.
      expect(call.update.title).toBe('עוגת שוקולד');
    });

    it('stores a photo in Blob and saves the resulting URL', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ image_url: 'https://blob.example/recipes/big.jpg' });
      vi.mocked(storeTelegramPhoto).mockResolvedValue('https://blob.example/recipes/big.jpg');

      const response = await webhookPOST(
        webhookRequest({
          update_id: 8,
          channel_post: channelPost({
            text: undefined,
            caption: RECIPE_TEXT,
            photo: [
              { file_id: 'small', file_unique_id: 's', width: 90, height: 90, file_size: 1_000 },
              { file_id: 'large', file_unique_id: 'l', width: 1280, height: 1280, file_size: 90_000 }
            ]
          })
        })
      );

      expect(response.status).toBe(200);
      // The largest PhotoSize is the one we keep.
      expect(storeTelegramPhoto).toHaveBeenCalledWith('large');

      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.create.image_url).toBe('https://blob.example/recipes/big.jpg');
      expect(call.create.media_type).toBe('image_url');
      // Caption is used as the recipe body when there is no `text`.
      expect(call.create.raw_content).toBe(RECIPE_TEXT);
    });
  });

  describe('old channel', () => {
    it('reformats with Gemini, publishes to the main channel and stores the new id', async () => {
      const rawText = 'עוגת שוקולד של סבתא, שוקולד וביצים, לערבב ולאפות';
      const formatted = RECIPE_TEXT;

      vi.mocked(reformatRecipe).mockResolvedValue(formatted);
      vi.mocked(sendMessage).mockResolvedValue({
        message_id: 909,
        chat: { id: MAIN_CHANNEL_ID, type: 'channel' },
        date: 1_700_000_900,
        text: formatted
      } as any);
      prismaMock.recipe.findUnique.mockResolvedValue(null);
      mockUpsertResult({ id: 11 });

      const response = await webhookPOST(
        webhookRequest({
          update_id: 9,
          channel_post: {
            message_id: 42,
            chat: { id: OLD_CHANNEL_ID, type: 'channel', title: 'Old' },
            date: 1_700_000_800,
            text: rawText
          }
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json).toMatchObject({
        ok: true,
        source: 'old_channel',
        sourceMessageId: 42,
        telegram_id: 909,
        action: 'created'
      });

      expect(reformatRecipe).toHaveBeenCalledWith(rawText);
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ chat_id: MAIN_CHANNEL_ID, text: formatted })
      );

      // Stored under the NEW main-channel id, never the old-channel one.
      const call = prismaMock.recipe.upsert.mock.calls[0][0] as any;
      expect(call.where).toEqual({ telegram_id: 909 });
      expect(call.create.raw_content).toBe(formatted);
      expect(call.create.sync_status).toBe('synced');
    });

    it('still answers 200 when Gemini fails, so Telegram does not retry forever', async () => {
      vi.mocked(reformatRecipe).mockRejectedValue(new Error('Gemini unavailable'));

      const response = await webhookPOST(
        webhookRequest({
          update_id: 10,
          channel_post: {
            message_id: 43,
            chat: { id: OLD_CHANNEL_ID, type: 'channel' },
            date: 1_700_000_800,
            text: 'משהו גולמי'
          }
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ok).toBe(true);
      expect(json.error).toBe('processing_failed');
      expect(sendMessage).not.toHaveBeenCalled();
      expect(prismaMock.recipe.upsert).not.toHaveBeenCalled();
    });

    it('ignores edits in the old channel (a re-publish would duplicate)', async () => {
      const response = await webhookPOST(
        webhookRequest({
          update_id: 11,
          edited_channel_post: {
            message_id: 44,
            chat: { id: OLD_CHANNEL_ID, type: 'channel' },
            date: 1_700_000_800,
            text: 'טקסט ערוך'
          }
        })
      );

      expect(response.status).toBe(200);
      const json = await parseJsonResponse<any>(response);
      expect(json.ignored).toBe('old_channel_edit');
      expect(reformatRecipe).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  it('answers 200 when the DB is down, rather than inviting a retry storm', async () => {
    prismaMock.recipe.findUnique.mockRejectedValue(new Error('Connection refused'));

    const response = await webhookPOST(
      webhookRequest({ update_id: 12, channel_post: channelPost() })
    );

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.error).toBe('processing_failed');
  });
});

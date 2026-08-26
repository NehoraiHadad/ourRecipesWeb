/**
 * POST /api/webhooks/telegram — the input path (ARCHITECTURE §4.1, §6).
 *
 * Registered with `setWebhook` using `secret_token` and
 * `allowed_updates=["channel_post","edited_channel_post"]`.
 *
 * One channel matters (Wave 5.4): the **old** channel is the sole intake.
 * Posts and edits share a single flow — a message id a row already claims
 * (via `{source_channel, source_message_id}`) updates that row; anything
 * else becomes a new recipe. That lookup is also what makes Telegram's
 * redeliveries idempotent.
 *
 * ## Decision table
 *
 * | Condition                                   | Response | Effect                              |
 * |---------------------------------------------|----------|-------------------------------------|
 * | `X-Telegram-Bot-Api-Secret-Token` mismatch  | **401**  | nothing; not from Telegram          |
 * | body is not JSON                            | 200      | ignored                             |
 * | no `channel_post` / `edited_channel_post`   | 200      | ignored                             |
 * | `chat.id` is neither of our channels        | 200      | ignored, logged                     |
 * | main channel (frozen, pre-deletion)         | 200      | ignored                             |
 * | old channel, no text and no photo           | 200      | ignored                             |
 * | old channel, message a row claims           | 200      | reformat → snapshot → row update    |
 * | old channel, unclaimed message              | 200      | reformat → store under internal id  |
 *
 * A photo without usable text is still a recipe — a photographed recipe page
 * completed by hand in the app — so only posts with *neither* are ignored.
 * | anything throws after auth                  | 200      | logged; no Telegram retry storm     |
 *
 * **Everything after the secret check answers 200.** Telegram retries non-2xx
 * deliveries with backoff and eventually parks the webhook; for our failure
 * modes (Gemini hiccup, DB outage) a retry would replay the same failure.
 * Failures are logged and swept up by the daily reconcile instead.
 */
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { unauthorizedResponse, verifyTelegramWebhookSecret } from '@/lib/internal/auth';
import { classifyChannel } from '@/lib/telegram/channels';
import { largestPhotoFileId } from '@/lib/recipes/ingest';
import { ingestOldChannelPost } from '@/lib/recipes/oldChannel';
import { applyOldChannelEdit, findRecipeByOldChannelSource } from '@/lib/recipes/oldChannelEdit';
import type { TelegramMessage, TelegramUpdate } from '@/lib/telegram/types';

export const dynamic = 'force-dynamic';

const log = logger.child({ context: 'api/webhooks/telegram' });

/** Every non-401 answer looks like this. `ignored` explains a no-op. */
function ack(body: Record<string, unknown> = {}): Response {
  return Response.json({ ok: true, ...body }, { status: 200 });
}

/** Channel posts carry their text in `text`, or in `caption` when they have a photo. */
function messageText(message: TelegramMessage): string {
  return message.text ?? message.caption ?? '';
}

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Authenticate. The only path that does not return 200.
  if (!verifyTelegramWebhookSecret(request)) {
    log.warn('Rejected webhook delivery with a bad or missing secret token');
    return unauthorizedResponse();
  }

  try {
    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      log.warn('Webhook delivery had an unparseable body');
      return ack({ ignored: 'invalid_json' });
    }

    // 2. Channel posts only — `message`, `callback_query`, … are not ours.
    const isEdit = Boolean(update?.edited_channel_post);
    const message = update?.channel_post ?? update?.edited_channel_post;

    if (!message) {
      return ack({ ignored: 'unsupported_update' });
    }

    // 3. Known channels only (ARCHITECTURE §6).
    const channel = classifyChannel(message.chat?.id);
    if (channel === 'unknown') {
      log.warn(
        { chatId: message.chat?.id, messageId: message.message_id },
        'Webhook delivery from an unknown chat — ignoring'
      );
      return ack({ ignored: 'unknown_chat' });
    }

    // The main channel is frozen: the app no longer writes there, and nothing
    // posted there is ours to ingest. The row stays in the decision table only
    // until the channel itself is deleted.
    if (channel === 'main') {
      return ack({ ignored: 'main_channel_frozen' });
    }

    const text = messageText(message);
    const photoFileId = largestPhotoFileId(message.photo);
    if (!text.trim() && !photoFileId) {
      return ack({ ignored: 'old_channel_empty' });
    }

    const existing = await findRecipeByOldChannelSource(message.message_id);
    if (existing) {
      // A photo-only message already has its row; there is no text edit to apply.
      if (!text.trim()) {
        return ack({
          source: 'old_channel',
          edited: isEdit,
          sourceMessageId: message.message_id,
          telegram_id: existing.telegram_id,
          action: 'unchanged'
        });
      }
      const edit = await applyOldChannelEdit(existing, text);
      return ack({
        source: 'old_channel',
        edited: isEdit,
        sourceMessageId: message.message_id,
        telegram_id: edit.telegramId,
        action: edit.action,
        needs_review: edit.needsReview
      });
    }

    const result = await ingestOldChannelPost({
      sourceMessageId: message.message_id,
      text,
      photoFileId,
      messageDate: message.date ? new Date(message.date * 1000) : null
    });

    return ack({
      source: 'old_channel',
      edited: isEdit,
      sourceMessageId: message.message_id,
      telegram_id: result.telegramId,
      action: result.ingest.action
    });
  } catch (error) {
    // Swallow deliberately — see the module docstring.
    log.error({ err: error }, 'Webhook processing failed; acknowledging anyway');
    return ack({ error: 'processing_failed' });
  }
}

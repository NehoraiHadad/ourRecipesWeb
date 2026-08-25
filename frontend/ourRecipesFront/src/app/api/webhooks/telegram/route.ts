/**
 * POST /api/webhooks/telegram — the input path (ARCHITECTURE §4.1, §4.2, §6).
 *
 * Registered with `setWebhook` using `secret_token` and
 * `allowed_updates=["channel_post","edited_channel_post"]`.
 *
 * ## Decision table
 *
 * | Condition                                   | Response | Effect                              |
 * |---------------------------------------------|----------|-------------------------------------|
 * | `X-Telegram-Bot-Api-Secret-Token` mismatch  | **401**  | nothing; not from Telegram          |
 * | body is not JSON                            | 200      | ignored                             |
 * | no `channel_post` / `edited_channel_post`   | 200      | ignored                             |
 * | `chat.id` is neither of our channels        | 200      | ignored, logged                     |
 * | main channel, place message ("המלצה")       | 200      | upsert into `places`, not `recipes` |
 * | main channel, menu mirror ("תפריט חדש")     | 200      | ignored (menus are app-authored)    |
 * | main channel, text identical to DB          | 200      | no-op (loop prevention)             |
 * | main channel, 🗑️ prefix                     | 200      | `status = ARCHIVED`                 |
 * | main channel, otherwise                     | 200      | parse + upsert by `message_id`      |
 * | main channel + photo                        | 200      | photo → Blob, `image_url` saved     |
 * | old channel, new post                       | 200      | Gemini reformat → publish → upsert  |
 * | old channel, edit                           | 200      | ignored (would double-publish)      |
 * | anything throws after auth                  | 200      | logged; no Telegram retry storm     |
 *
 * **Everything after the secret check answers 200.** Telegram retries non-2xx
 * deliveries with backoff and eventually parks the webhook; for our failure
 * modes (Gemini hiccup, Blob outage) a retry would replay the same failure, and
 * for the old-channel path it could publish the recipe twice. Failures are
 * logged and swept up by the daily reconcile instead.
 */
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { unauthorizedResponse, verifyTelegramWebhookSecret } from '@/lib/internal/auth';
import { classifyChannel, getMainChannelId } from '@/lib/telegram/channels';
import { ingestChannelMessage } from '@/lib/telegram/channelIngest';
import { largestPhotoFileId } from '@/lib/recipes/ingest';
import { republishOldChannelPost } from '@/lib/recipes/oldChannel';
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

    const text = messageText(message);

    if (channel === 'old') {
      // Edits in the old channel are ignored: the recipe already lives in the
      // main channel under its own id, and reformatting again would publish a
      // duplicate. The reconcile pass is the place to notice such drift.
      if (isEdit) {
        log.info(
          { messageId: message.message_id },
          'Ignoring an edit in the old channel (would double-publish)'
        );
        return ack({ ignored: 'old_channel_edit' });
      }

      if (!text.trim()) {
        return ack({ ignored: 'old_channel_empty' });
      }

      const mainChannelId = getMainChannelId();
      if (mainChannelId === null) {
        log.error('TELEGRAM_CHANNEL_ID is not configured — cannot republish old-channel post');
        return ack({ ignored: 'main_channel_not_configured' });
      }

      const result = await republishOldChannelPost({
        sourceMessageId: message.message_id,
        text,
        mainChannelId
      });

      return ack({
        source: 'old_channel',
        sourceMessageId: message.message_id,
        telegram_id: result.publishedMessageId,
        action: result.ingest.action
      });
    }

    // 4. Main channel: classify (recipe/place/menu) + upsert under this
    //    message id.
    const result = await ingestChannelMessage({
      telegramId: message.message_id,
      text,
      photoFileId: largestPhotoFileId(message.photo),
      messageDate: message.date ? new Date(message.date * 1000) : null
    });

    return ack({
      source: 'main_channel',
      edited: isEdit,
      kind: result.kind,
      telegram_id: result.telegramId,
      action: result.action,
      status: result.status
    });
  } catch (error) {
    // Swallow deliberately — see the module docstring.
    log.error({ err: error }, 'Webhook processing failed; acknowledging anyway');
    return ack({ error: 'processing_failed' });
  }
}

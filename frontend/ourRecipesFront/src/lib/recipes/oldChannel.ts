/**
 * Old-channel intake (ARCHITECTURE §4.1, Wave 5.4).
 *
 * The old channel holds raw, unstructured recipe text — the way people
 * actually write recipes to each other. Gemini reformats the text in memory
 * and the result is stored **directly** in Postgres under a fresh internal
 * `telegram_id`, with the origin recorded as
 * `{source_channel: 'old', source_message_id}`. Nothing is published to any
 * channel — the app is the shop window now.
 *
 * Kept out of `ingest.ts` on purpose: the internal upsert route must not drag
 * the Gemini SDK into its bundle.
 */
import { logger } from '@/lib/logger';
import { reformatRecipe } from '@/lib/services/aiService';
import { generateInternalTelegramId } from '@/lib/recipes/recipeId';
import {
  ingestRecipeMessage,
  SOURCE_CHANNEL_OLD,
  type IngestResult
} from '@/lib/recipes/ingest';

const log = logger.child({ context: 'recipes/oldChannel' });

export interface OldChannelInput {
  /** Message id in the *old* channel — stored as `source_message_id`, so a later edit there can find this row. */
  sourceMessageId: number;
  /** Raw text/caption of the old-channel post. */
  text: string;
  /** Original post time, used as `created_at` when the row is first created. */
  messageDate?: Date | null;
}

export interface OldChannelResult {
  /** The internal `telegram_id` the recipe was stored under — the public URL key. */
  telegramId: number;
  ingest: IngestResult;
}

/**
 * Reformats an old-channel post and stores it as a recipe row.
 *
 * Callers must first check no row already claims this `sourceMessageId`
 * (`findRecipeByOldChannelSource`) — that is both the edit path and what
 * makes webhook retries idempotent. If two deliveries still race past that
 * check, the `(source_channel, source_message_id)` unique constraint rejects
 * the second insert.
 *
 * Throws on AI failure — the webhook route catches and still answers 200,
 * because a Telegram retry storm would only replay the same failure.
 */
export async function ingestOldChannelPost(input: OldChannelInput): Promise<OldChannelResult> {
  const { sourceMessageId, text } = input;

  log.info({ sourceMessageId, chars: text.length }, 'Reformatting old-channel post');

  const formatted = (await reformatRecipe(text)).trim();
  if (!formatted) {
    throw new Error(`Gemini returned empty text for old-channel message ${sourceMessageId}`);
  }

  const telegramId = generateInternalTelegramId();
  const ingest = await ingestRecipeMessage({
    telegramId,
    source: { channel: SOURCE_CHANNEL_OLD, messageId: sourceMessageId },
    text: formatted,
    messageDate: input.messageDate ?? null
  });

  log.info(
    { sourceMessageId, telegramId, action: ingest.action },
    'Old-channel post stored as a recipe'
  );

  return { telegramId, ingest };
}

/**
 * Old-channel intake (ARCHITECTURE §4.1).
 *
 * The legacy channel holds raw, unstructured recipe text — the way people
 * actually write recipes to each other. It is an *input* only: nothing is ever
 * stored under an old-channel message id. Instead Gemini reformats the text
 * into the canonical channel format, the bot publishes that to the main
 * channel, and the recipe is stored under the **new** message id.
 *
 * Kept out of `ingest.ts` on purpose: the internal upsert route must not drag
 * the Gemini SDK into its bundle.
 */
import { logger } from '@/lib/logger';
import { sendMessage } from '@/lib/telegram/botApi';
import { reformatRecipe } from '@/lib/services/aiService';
import { ingestRecipeMessage, type IngestResult } from '@/lib/recipes/ingest';

const log = logger.child({ context: 'recipes/oldChannel' });

export interface OldChannelInput {
  /** Message id in the *old* channel — logged for traceability, never stored. */
  sourceMessageId: number;
  /** Raw text/caption of the old-channel post. */
  text: string;
  /** Main channel id to publish the reformatted recipe to. */
  mainChannelId: number;
}

export interface OldChannelResult {
  /** Message id created in the main channel. */
  publishedMessageId: number;
  ingest: IngestResult;
}

/**
 * Reformats an old-channel post and republishes it to the main channel.
 *
 * Throws on AI or Bot API failure — the webhook route catches and still answers
 * 200, because a Telegram retry storm would only replay the same failure (and,
 * worse, could double-publish once the transient cause clears).
 */
export async function republishOldChannelPost(
  input: OldChannelInput
): Promise<OldChannelResult> {
  const { sourceMessageId, text, mainChannelId } = input;

  log.info({ sourceMessageId, chars: text.length }, 'Reformatting old-channel post');

  const formatted = (await reformatRecipe(text)).trim();
  if (!formatted) {
    throw new Error(`Gemini returned empty text for old-channel message ${sourceMessageId}`);
  }

  const published = await sendMessage({
    chat_id: mainChannelId,
    text: formatted,
    disable_web_page_preview: true
  });

  log.info(
    { sourceMessageId, publishedMessageId: published.message_id },
    'Old-channel post republished to the main channel'
  );

  // Stored under the NEW id. The main-channel webhook for this very message
  // will arrive moments later and find identical content — a no-op.
  const ingest = await ingestRecipeMessage({
    telegramId: published.message_id,
    text: formatted,
    messageDate: published.date ? new Date(published.date * 1000) : null
  });

  return { publishedMessageId: published.message_id, ingest };
}

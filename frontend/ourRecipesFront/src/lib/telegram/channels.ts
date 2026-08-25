/**
 * Channel identity for the Telegram input path (ARCHITECTURE §3, §6).
 *
 * Two channels matter to this app:
 *  - the **main** channel (`TELEGRAM_CHANNEL_ID`) — input *and* shop window;
 *    everything posted there becomes a recipe row.
 *  - the **old** channel (`TELEGRAM_OLD_CHANNEL_ID`) — raw source material;
 *    posts there get reformatted by Gemini and re-published to the main channel.
 *
 * Anything else is not ours and must be ignored (never trusted, never stored).
 *
 * Env is read **at call time**, never at module load, so serverless cold starts
 * and tests can populate `process.env` first.
 */

/** Which of our channels a `chat.id` belongs to. */
export type ChannelKind = 'main' | 'old' | 'unknown';

/** Parses a `-100…` channel id from the environment. Returns null when unset/invalid. */
function readChannelId(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;

  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;

  return parsed;
}

/** `TELEGRAM_CHANNEL_ID` — the main channel, target of every mirror write. */
export function getMainChannelId(): number | null {
  return readChannelId('TELEGRAM_CHANNEL_ID');
}

/** `TELEGRAM_OLD_CHANNEL_ID` — the legacy raw-input channel. Optional. */
export function getOldChannelId(): number | null {
  return readChannelId('TELEGRAM_OLD_CHANNEL_ID');
}

/**
 * Classifies an incoming `chat.id`.
 *
 * The main channel wins when both env vars are (mis)configured to the same id,
 * so a duplicated value can never cause an infinite reformat→publish loop.
 */
export function classifyChannel(chatId: number | undefined | null): ChannelKind {
  if (typeof chatId !== 'number' || !Number.isFinite(chatId)) return 'unknown';

  if (chatId === getMainChannelId()) return 'main';
  if (chatId === getOldChannelId()) return 'old';

  return 'unknown';
}

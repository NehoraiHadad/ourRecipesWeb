/**
 * Channel identity for the Telegram input path (ARCHITECTURE §3, §6).
 *
 * One channel matters since Wave 5: the **old** channel
 * (`TELEGRAM_OLD_CHANNEL_ID`) — the raw free-text source, the sole intake.
 * The **main** channel (`TELEGRAM_CHANNEL_ID`) is frozen pre-deletion: it is
 * still *recognised* so the webhook can explicitly ignore its posts, and both
 * the env var and the 'main' branch here go away with the channel itself
 * (stage 5.7).
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

/** `TELEGRAM_CHANNEL_ID` — the frozen main channel, kept only to be ignored. */
export function getMainChannelId(): number | null {
  return readChannelId('TELEGRAM_CHANNEL_ID');
}

/** `TELEGRAM_OLD_CHANNEL_ID` — the old channel, the sole intake. */
export function getOldChannelId(): number | null {
  return readChannelId('TELEGRAM_OLD_CHANNEL_ID');
}

/**
 * Classifies an incoming `chat.id`.
 *
 * The main channel wins when both env vars are (mis)configured to the same id,
 * so a duplicated value freezes rather than ingests.
 */
export function classifyChannel(chatId: number | undefined | null): ChannelKind {
  if (typeof chatId !== 'number' || !Number.isFinite(chatId)) return 'unknown';

  if (chatId === getMainChannelId()) return 'main';
  if (chatId === getOldChannelId()) return 'old';

  return 'unknown';
}

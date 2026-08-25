/**
 * Place <-> Telegram mirror.
 *
 * Ports the inline message formatting + `TelegramService` calls from
 * `backend/ourRecipesBack/routes/places.py` verbatim (create/update/delete
 * each build a slightly different message — kept as three literal ports,
 * not unified, to match). Best-effort per ARCHITECTURE §4.3: the DB write
 * always happens first; every function here logs and swallows failures
 * instead of throwing.
 */
import { logger } from '@/lib/logger';
import { editMessageText, sendMessage } from './botApi';

const log = logger.child({ context: 'telegram/placeMirror' });

export interface PlaceForTelegram {
  name: string;
  type: string | null;
  website: string | null;
  location: string | null;
  waze_link: string | null;
  description: string | null;
}

const TYPE_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  bar: '🍺',
  attraction: '🎡',
  shopping: '🛍️',
  other: '📍'
};

function emojiFor(type: string | null): string {
  return (type && TYPE_EMOJI[type]) || '📍';
}

function fieldLines(place: PlaceForTelegram): string[] {
  return [
    `שם: ${place.name}`,
    `סוג: ${place.type || 'לא צוין'}`,
    `אתר: ${place.website || 'לא צוין'}`,
    `מיקום: ${place.location || 'לא צוין'}`,
    `Waze: ${place.waze_link || 'לא צוין'}`,
    `תיאור: ${place.description || 'לא צוין'}`
  ];
}

/** `create_place`'s inline message: "המלצה חדשה". */
export function formatPlaceCreateMessage(place: PlaceForTelegram, userName: string): string {
  return [`${emojiFor(place.type)} המלצה חדשה`, '', ...fieldLines(place), `נוסף על ידי: ${userName}`].join('\n');
}

/** `update_place`'s inline message: "המלצה" + "(עודכן)", attributed to the original creator. */
export function formatPlaceUpdateMessage(place: PlaceForTelegram, createdBy: string): string {
  return [
    `${emojiFor(place.type)} המלצה`,
    '',
    ...fieldLines(place),
    `נוסף על ידי: ${createdBy}`,
    '(עודכן)'
  ].join('\n');
}

/** `Place.format_telegram_message` — used by `delete_place` as the base before appending the deletion suffix. */
export function formatPlaceBaseMessage(place: PlaceForTelegram, createdBy: string): string {
  return [`${emojiFor(place.type)} המלצה`, '', ...fieldLines(place), `נוסף על ידי: ${createdBy}`].join('\n');
}

function getChannelId(): string | null {
  const raw = process.env.TELEGRAM_CHANNEL_ID;
  return raw ? raw : null;
}

/** Port of `create_place`'s Telegram send. Returns the message id, or `null` on any failure. */
export async function mirrorPlaceCreate(place: PlaceForTelegram, userName: string): Promise<number | null> {
  const channel = getChannelId();
  if (!channel) {
    log.warn('TELEGRAM_CHANNEL_ID is not configured — skipping place mirror');
    return null;
  }

  try {
    const text = formatPlaceCreateMessage(place, userName);
    const message = await sendMessage({ chat_id: channel, text });
    return message.message_id;
  } catch (error) {
    log.warn({ err: error }, 'Failed to mirror new place to Telegram');
    return null;
  }
}

/** Port of `update_place`'s Telegram edit. Best-effort — never throws. */
export async function mirrorPlaceUpdate(
  place: PlaceForTelegram,
  createdBy: string,
  telegramMessageId: number | null
): Promise<void> {
  if (!telegramMessageId) return;
  const channel = getChannelId();
  if (!channel) return;

  try {
    const text = formatPlaceUpdateMessage(place, createdBy);
    await editMessageText({ chat_id: channel, message_id: telegramMessageId, text });
  } catch (error) {
    log.warn({ err: error, telegramMessageId }, 'Failed to mirror place update to Telegram');
  }
}

/** Port of `delete_place`'s Telegram edit (message is edited, not deleted — Telegram convention for manual deletes). */
export async function mirrorPlaceDelete(
  place: PlaceForTelegram,
  createdBy: string,
  userName: string,
  telegramMessageId: number | null
): Promise<void> {
  if (!telegramMessageId) return;
  const channel = getChannelId();
  if (!channel) return;

  try {
    const text = `${formatPlaceBaseMessage(place, createdBy)}\n\n❌ נמחק על ידי: ${userName}`;
    await editMessageText({ chat_id: channel, message_id: telegramMessageId, text });
  } catch (error) {
    log.warn({ err: error, telegramMessageId }, 'Failed to mirror place deletion to Telegram');
  }
}

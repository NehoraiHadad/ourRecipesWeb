/**
 * Channel-message classification.
 *
 * The main Telegram channel carries more than recipes: the app mirrors place
 * recommendations (`placeMirror.ts`) and menus (`menuMirror.ts`) into it, and
 * humans occasionally post recommendations in the same format. Everything
 * that ingests channel messages must classify first, so a place or menu
 * message never lands in the recipes table (and never shows up in recipe
 * search).
 *
 * A message's kind is decided by its first line, matching the headers the
 * mirrors write. The leading emoji varies (place-type emoji, 🗑️ archive
 * marker, bidi control characters), so anything that is not a letter or a
 * digit may precede the header.
 */

export type ChannelMessageKind = 'recipe' | 'place' | 'menu';

/** Emoji, punctuation, bidi controls — everything before the Hebrew header. */
const LEADING_SYMBOLS = /^[^A-Za-z0-9֐-׿]+/;

const PLACE_HEADER = /^המלצה(\s+חדשה)?$/;
const MENU_HEADER = /^תפריט חדש$/;

export function classifyChannelMessage(text: string): ChannelMessageKind {
  const firstLine = (text ?? '').trimStart().split('\n', 1)[0].trim();
  const header = firstLine.replace(LEADING_SYMBOLS, '').trim();
  if (PLACE_HEADER.test(header)) return 'place';
  if (MENU_HEADER.test(header)) return 'menu';
  return 'recipe';
}

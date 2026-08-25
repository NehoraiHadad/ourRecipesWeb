/**
 * Place ingestion — a channel "המלצה" message becomes a `Place` row.
 *
 * The message format is whatever `placeMirror.ts` writes (one `שם:`/`סוג:`/…
 * field per line); this is its inverse. Keyed by `telegram_message_id`, so
 * re-ingesting the same message (webhook edit, reconcile, history import) is
 * an update, never a duplicate.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'places/ingest' });

/** `placeMirror` writes this for an empty field; parse it back to null. */
const EMPTY_VALUE = 'לא צוין';

const FIELD_PREFIXES = {
  name: 'שם:',
  type: 'סוג:',
  website: 'אתר:',
  location: 'מיקום:',
  waze_link: 'Waze:',
  description: 'תיאור:',
  created_by: 'נוסף על ידי:'
} as const;

const DELETED_PREFIX = '❌ נמחק על ידי:';

export interface ParsedPlaceMessage {
  name: string;
  type: string | null;
  website: string | null;
  location: string | null;
  waze_link: string | null;
  description: string | null;
  created_by: string | null;
  /** The mirror marks deletion by editing the message, not removing it. */
  isDeleted: boolean;
}

function fieldValue(line: string, prefix: string): string | null {
  const value = line.slice(prefix.length).trim();
  return value && value !== EMPTY_VALUE ? value : null;
}

/** Parses a place message body. Returns null when it has no `שם:` line. */
export function parsePlaceMessage(text: string): ParsedPlaceMessage | null {
  const parsed: ParsedPlaceMessage = {
    name: '',
    type: null,
    website: null,
    location: null,
    waze_link: null,
    description: null,
    created_by: null,
    isDeleted: false
  };

  for (const rawLine of (text ?? '').split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith(DELETED_PREFIX)) {
      parsed.isDeleted = true;
      continue;
    }
    for (const [field, prefix] of Object.entries(FIELD_PREFIXES)) {
      if (line.startsWith(prefix)) {
        const value = fieldValue(line, prefix);
        if (field === 'name') parsed.name = value ?? '';
        else parsed[field as keyof Omit<ParsedPlaceMessage, 'name' | 'isDeleted'>] = value;
        break;
      }
    }
  }

  return parsed.name ? parsed : null;
}

export interface IngestPlaceInput {
  /** Channel `message_id` — the place's identity (`Place.telegram_message_id`). */
  telegramId: number;
  text: string;
  messageDate?: Date | null;
}

export interface IngestPlaceResult {
  action: 'created' | 'updated' | 'skipped';
  placeId?: number;
}

export async function ingestPlaceMessage(input: IngestPlaceInput): Promise<IngestPlaceResult> {
  const parsed = parsePlaceMessage(input.text);
  if (!parsed) {
    log.warn({ telegramId: input.telegramId }, 'Place message without a שם: line — skipping');
    return { action: 'skipped' };
  }

  const data = {
    name: parsed.name,
    type: parsed.type,
    website: parsed.website,
    location: parsed.location,
    waze_link: parsed.waze_link,
    description: parsed.description,
    is_deleted: parsed.isDeleted,
    is_synced: true,
    last_sync: new Date()
  };

  const existing = await prisma.place.findFirst({
    where: { telegram_message_id: input.telegramId },
    select: { id: true }
  });

  const place = existing
    ? await prisma.place.update({ where: { id: existing.id }, data })
    : await prisma.place.create({
        data: {
          ...data,
          telegram_message_id: input.telegramId,
          created_by: parsed.created_by ?? 'טלגרם',
          ...(input.messageDate ? { created_at: input.messageDate } : {})
        }
      });

  const action = existing ? 'updated' : 'created';
  log.info({ telegramId: input.telegramId, placeId: place.id, action }, 'Place ingested from Telegram');
  return { action, placeId: place.id };
}

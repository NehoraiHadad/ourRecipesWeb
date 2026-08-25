/**
 * Channel ingestion — the single funnel every main-channel message goes
 * through, whether it arrives via the webhook or the Telethon
 * reconcile/history import (`/api/internal/recipes/upsert`).
 *
 * Classifies the message first (`messageKind.ts`) and routes it:
 *  - recipe → `ingestRecipeMessage` (the recipes table)
 *  - place  → `ingestPlaceMessage` (the places table)
 *  - menu   → skipped: menus are app-authored; the channel message is only
 *    the app's own mirror of a `Menu` row, never the source of truth
 *
 * For non-recipe kinds it also deletes any stray `Recipe` row stored under
 * the same message id — ingests that ran before classification existed filed
 * places/menus as recipes, and this makes any re-ingest (edit, reconcile,
 * full resync) self-healing.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { classifyChannelMessage, type ChannelMessageKind } from './messageKind';
import {
  ingestRecipeMessage,
  type IngestRecipeInput,
  type IngestResult
} from '@/lib/recipes/ingest';
import { ingestPlaceMessage } from '@/lib/places/ingest';

const log = logger.child({ context: 'telegram/channelIngest' });

export interface ChannelIngestResult extends IngestResult {
  kind: ChannelMessageKind;
  placeId?: number;
}

export async function ingestChannelMessage(input: IngestRecipeInput): Promise<ChannelIngestResult> {
  const kind = classifyChannelMessage(input.text ?? '');

  if (kind === 'recipe') {
    return { kind, ...(await ingestRecipeMessage(input)) };
  }

  const stray = await prisma.recipe.deleteMany({ where: { telegram_id: input.telegramId } });
  if (stray.count > 0) {
    log.info(
      { telegramId: input.telegramId, kind },
      'Removed a stray recipe row for a non-recipe channel message'
    );
  }

  if (kind === 'place') {
    const place = await ingestPlaceMessage({
      telegramId: input.telegramId,
      text: input.text ?? '',
      messageDate: input.messageDate ?? null
    });
    return { kind, action: place.action, telegramId: input.telegramId, placeId: place.placeId };
  }

  return { kind, action: 'skipped', telegramId: input.telegramId };
}

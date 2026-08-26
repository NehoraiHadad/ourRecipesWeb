/**
 * Channel edit permissions.
 *
 * Bot API `getChatMember` against the **old** channel (Wave 5.5) — the sole
 * remaining channel and the family's roster. Telegram only lets admins post
 * to a channel, so "can write recipes to the source channel" is the bar:
 * `status === 'creator' || status === 'administrator'`. (The pre-Wave-5 check
 * required `can_edit_messages` on the main channel, which mattered when
 * editing meant editing channel messages; edits are DB writes now.)
 */
import { getChatMember } from '@/lib/telegram/botApi';
import { logger } from '@/lib/logger';
import type { TelegramChatId } from '@/lib/telegram/types';

const log = logger.child({ context: 'auth/permissions' });

/** Cache lifetime — one hour, same as the Flask cache. */
export const PERMISSION_CACHE_TTL_MS = 60 * 60 * 1000;

/** Guest ids never have edit rights. */
export const GUEST_ID_PREFIX = 'guest_';

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

/**
 * Module-level cache. Serverless-friendly: it dies with the instance, which is
 * an acceptable (and self-healing) trade-off — same behaviour as before.
 */
const permissionCache = new Map<string, CacheEntry>();

function resolveChannelId(explicit?: TelegramChatId): TelegramChatId | null {
  const raw = explicit ?? process.env.TELEGRAM_OLD_CHANNEL_ID;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

/**
 * Whether `userId` may edit recipes, judged by admin status on the old channel.
 *
 * Guests short-circuit to `false`. Successful checks are cached for an hour;
 * Telegram failures return `false` **without** being cached, so a transient
 * outage does not lock an admin out for an hour.
 *
 * @param userId Telegram user id (as string) or `guest_<uuid>`.
 * @param channelId Optional channel override; defaults to `TELEGRAM_OLD_CHANNEL_ID`.
 */
export async function checkEditPermission(
  userId: string,
  channelId?: TelegramChatId
): Promise<boolean> {
  if (!userId) return false;

  if (userId.startsWith(GUEST_ID_PREFIX)) {
    log.debug({ userId }, 'Guest user — no edit permission');
    return false;
  }

  const channel = resolveChannelId(channelId);
  if (channel === null) {
    log.error('TELEGRAM_OLD_CHANNEL_ID is not configured — denying edit permission');
    return false;
  }

  const cacheKey = `${userId}:${channel}`;
  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    log.debug({ userId, channel, result: cached.value }, 'Permission cache hit');
    return cached.value;
  }

  try {
    const member = await getChatMember(channel, userId);
    const canEdit = member.status === 'creator' || member.status === 'administrator';

    permissionCache.set(cacheKey, {
      value: canEdit,
      expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS
    });

    log.info({ userId, channel, status: member.status, canEdit }, 'Permission checked');
    return canEdit;
  } catch (error) {
    // Not cached: could be "user not found" (permanent) or an outage (transient).
    log.warn({ err: error, userId, channel }, 'Permission check failed — denying');
    return false;
  }
}

/** Drops cached permissions for one user, or the whole cache when omitted. */
export function clearPermissionCache(userId?: string): void {
  if (!userId) {
    permissionCache.clear();
    return;
  }
  for (const key of Array.from(permissionCache.keys())) {
    if (key.startsWith(`${userId}:`)) permissionCache.delete(key);
  }
}

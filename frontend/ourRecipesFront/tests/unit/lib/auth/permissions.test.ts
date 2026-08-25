/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkEditPermission, clearPermissionCache } from '@/lib/auth/permissions';
import { getChatMember, TelegramApiError } from '@/lib/telegram/botApi';
import type { TelegramChatMember, TelegramChatMemberStatus } from '@/lib/telegram/types';

vi.mock('@/lib/telegram/botApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/telegram/botApi')>(
    '@/lib/telegram/botApi'
  );
  return { ...actual, getChatMember: vi.fn() };
});

const getChatMemberMock = vi.mocked(getChatMember);

function member(
  status: TelegramChatMemberStatus,
  extra: Partial<TelegramChatMember> = {}
): TelegramChatMember {
  return {
    status,
    user: { id: 12345678, is_bot: false, first_name: 'Tester' },
    ...extra
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPermissionCache();
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';
});

afterEach(() => {
  delete process.env.TELEGRAM_CHANNEL_ID;
});

describe('checkEditPermission', () => {
  it('returns false for guests without calling Telegram', async () => {
    await expect(checkEditPermission('guest_9f3c')).resolves.toBe(false);
    expect(getChatMemberMock).not.toHaveBeenCalled();
  });

  it('returns true for the channel creator', async () => {
    getChatMemberMock.mockResolvedValue(member('creator'));

    await expect(checkEditPermission('12345678')).resolves.toBe(true);
    expect(getChatMemberMock).toHaveBeenCalledWith(-1001234567890, '12345678');
  });

  it('returns true for an administrator with can_edit_messages', async () => {
    getChatMemberMock.mockResolvedValue(member('administrator', { can_edit_messages: true }));

    await expect(checkEditPermission('12345678')).resolves.toBe(true);
  });

  it('returns false for an administrator without can_edit_messages', async () => {
    getChatMemberMock.mockResolvedValue(member('administrator', { can_edit_messages: false }));

    await expect(checkEditPermission('12345678')).resolves.toBe(false);
  });

  it('returns false for a plain member', async () => {
    getChatMemberMock.mockResolvedValue(member('member'));

    await expect(checkEditPermission('12345678')).resolves.toBe(false);
  });

  it('caches a successful check — the second call does not hit Telegram', async () => {
    getChatMemberMock.mockResolvedValue(member('creator'));

    await expect(checkEditPermission('12345678')).resolves.toBe(true);
    await expect(checkEditPermission('12345678')).resolves.toBe(true);

    expect(getChatMemberMock).toHaveBeenCalledTimes(1);
  });

  it('caches negative results too', async () => {
    getChatMemberMock.mockResolvedValue(member('member'));

    await checkEditPermission('12345678');
    await checkEditPermission('12345678');

    expect(getChatMemberMock).toHaveBeenCalledTimes(1);
  });

  it('caches per user and channel', async () => {
    getChatMemberMock.mockResolvedValue(member('creator'));

    await checkEditPermission('111');
    await checkEditPermission('222');
    await checkEditPermission('111', -1009999999999);

    expect(getChatMemberMock).toHaveBeenCalledTimes(3);
  });

  it('expires cache entries after the TTL', async () => {
    vi.useFakeTimers();
    try {
      getChatMemberMock.mockResolvedValue(member('creator'));

      await checkEditPermission('12345678');
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      await checkEditPermission('12345678');

      expect(getChatMemberMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns false on a Telegram error and does not cache the failure', async () => {
    getChatMemberMock.mockRejectedValueOnce(
      new TelegramApiError({
        method: 'getChatMember',
        error_code: 400,
        description: 'Bad Request: user not found'
      })
    );
    await expect(checkEditPermission('12345678')).resolves.toBe(false);

    getChatMemberMock.mockResolvedValueOnce(member('creator'));
    await expect(checkEditPermission('12345678')).resolves.toBe(true);

    expect(getChatMemberMock).toHaveBeenCalledTimes(2);
  });

  it('returns false when TELEGRAM_CHANNEL_ID is not configured', async () => {
    delete process.env.TELEGRAM_CHANNEL_ID;

    await expect(checkEditPermission('12345678')).resolves.toBe(false);
    expect(getChatMemberMock).not.toHaveBeenCalled();
  });

  it('clearPermissionCache(userId) forces a re-check for that user only', async () => {
    getChatMemberMock.mockResolvedValue(member('creator'));

    await checkEditPermission('111');
    await checkEditPermission('222');
    clearPermissionCache('111');
    await checkEditPermission('111');
    await checkEditPermission('222');

    expect(getChatMemberMock).toHaveBeenCalledTimes(3);
  });
});

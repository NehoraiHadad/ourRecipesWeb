/**
 * @vitest-environment node
 *
 * HMAC verification of Telegram Login Widget payloads. The known-good vector is
 * computed in-test with node:crypto from a fake bot token — no secrets, no network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { verifyTelegramLogin } from '@/lib/auth/telegramLogin';
import type { TelegramAuthData } from '@/lib/auth/types';

const FAKE_TOKEN = '123456:FAKE-BOT-TOKEN-FOR-TESTS';

/** Signs auth data exactly the way Telegram does. */
function sign(fields: Record<string, string | number>, token = FAKE_TOKEN): TelegramAuthData {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHash('sha256').update(token).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return { ...fields, hash } as TelegramAuthData;
}

function freshFields(overrides: Record<string, string | number> = {}) {
  return {
    id: 12345678,
    first_name: 'נחוראי',
    username: 'tester',
    photo_url: 'https://t.me/i/userpic/320/tester.jpg',
    auth_date: Math.floor(Date.now() / 1000),
    ...overrides
  };
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = FAKE_TOKEN;
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  vi.useRealTimers();
});

describe('verifyTelegramLogin', () => {
  it('accepts a correctly signed payload', () => {
    expect(verifyTelegramLogin(sign(freshFields()))).toBe(true);
  });

  it('matches the reference data_check_string (keys sorted, joined by \\n)', () => {
    const fields = { id: 1, auth_date: Math.floor(Date.now() / 1000), first_name: 'A' };
    const expectedString = `auth_date=${fields.auth_date}\nfirst_name=A\nid=1`;
    const secretKey = createHash('sha256').update(FAKE_TOKEN).digest();
    const hash = createHmac('sha256', secretKey).update(expectedString).digest('hex');

    expect(verifyTelegramLogin({ ...fields, hash } as TelegramAuthData)).toBe(true);
  });

  it('rejects a tampered field', () => {
    const data = sign(freshFields());
    expect(verifyTelegramLogin({ ...data, id: 99999999 })).toBe(false);
  });

  it('rejects a tampered hash', () => {
    const data = sign(freshFields());
    expect(verifyTelegramLogin({ ...data, hash: 'f'.repeat(64) })).toBe(false);
  });

  it('rejects a payload with no hash', () => {
    const { hash, ...rest } = sign(freshFields());
    expect(verifyTelegramLogin(rest as TelegramAuthData)).toBe(false);
  });

  it('rejects a payload signed with a different bot token', () => {
    expect(verifyTelegramLogin(sign(freshFields(), '999:OTHER-TOKEN'))).toBe(false);
  });

  it('rejects auth_date older than 24h', () => {
    const stale = Math.floor(Date.now() / 1000) - (24 * 60 * 60 + 60);
    expect(verifyTelegramLogin(sign(freshFields({ auth_date: stale })))).toBe(false);
  });

  it('accepts auth_date just inside the 24h window', () => {
    const recent = Math.floor(Date.now() / 1000) - (24 * 60 * 60 - 60);
    expect(verifyTelegramLogin(sign(freshFields({ auth_date: recent })))).toBe(true);
  });

  it('honours a custom maxAgeSeconds', () => {
    const data = sign(freshFields({ auth_date: Math.floor(Date.now() / 1000) - 120 }));
    expect(verifyTelegramLogin(data, { maxAgeSeconds: 60 })).toBe(false);
    expect(verifyTelegramLogin(data, { maxAgeSeconds: 600 })).toBe(true);
  });

  it('rejects a non-numeric auth_date', () => {
    expect(verifyTelegramLogin(sign(freshFields({ auth_date: 'yesterday' })))).toBe(false);
  });

  it('rejects when TELEGRAM_BOT_TOKEN is not configured', () => {
    const data = sign(freshFields());
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(verifyTelegramLogin(data)).toBe(false);
  });

  it('does not mutate the input object', () => {
    const data = sign(freshFields());
    const snapshot = { ...data };
    verifyTelegramLogin(data);
    expect(data).toEqual(snapshot);
  });
});

import { describe, expect, it } from 'vitest';
import { subscriptionSchema, timerPushSchema } from '@/lib/timers/push/validation';
const keys = { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) };
describe('browser push input boundaries', () => {
  it.each(['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/Qabc', 'https://updates.push.services.mozilla.com/wpush/v2/abc'])('accepts browser push provider %s', endpoint => {
    expect(subscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
  });
  it.each(['http://fcm.googleapis.com/a', 'https://127.0.0.1/a', 'https://localhost/a', 'https://fcm.googleapis.com.evil.example/a', 'https://user:pass@fcm.googleapis.com/a', 'https://fcm.googleapis.com:8443/a'])('rejects unsafe endpoint %s', endpoint => {
    expect(subscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
  });
  it('requires a bounded future deadline and a same-app recipe URL', () => {
    const input = { subscriptionId: crypto.randomUUID(), version: 1, state: 'running', endsAt: Date.now() + 60000, recipeName: 'לחם', description: 'התפחה', recipeUrl: '/recipe/555', muted: false };
    expect(timerPushSchema.safeParse(input).success).toBe(true);
    expect(timerPushSchema.safeParse({ ...input, recipeUrl: '//evil.example' }).success).toBe(false);
    expect(timerPushSchema.safeParse({ ...input, endsAt: null }).success).toBe(false);
    expect(timerPushSchema.safeParse({ ...input, endsAt: Date.now() + 8 * 86400000 }).success).toBe(false);
    expect(timerPushSchema.safeParse({ ...input, state: 'paused', endsAt: null }).success).toBe(true);
  });
});

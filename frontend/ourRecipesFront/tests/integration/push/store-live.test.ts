import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('web-push', () => ({ default: { sendNotification: mocks.send } }));
const url = process.env.TIMER_PUSH_TEST_DATABASE_URL;
let db: PrismaClient;
let store: typeof import('@/lib/timers/push/store');
let delivery: typeof import('@/lib/timers/push/deliver');
const keys = { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) };
const input = (subscriptionId: string, version = 1) => ({ subscriptionId, version, state: 'running' as const,
  endsAt: Date.now() + 60000, recipeName: 'לחם', description: 'התפחה', recipeUrl: '/recipe/555', muted: false });

// Explicitly opt in to an isolated local database; never touch production data.
describe.skipIf(!url)('Timer Push real PostgreSQL transactions', () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !parsed.pathname.endsWith('/recipes_push_test')) throw new Error('Use the isolated local recipes_push_test database');
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('TIMER_PUSH_ENABLED', 'true'); vi.stubEnv('TIMER_PUSH_PUBLIC_KEY', 'test-public');
    vi.stubEnv('TIMER_PUSH_PRIVATE_KEY', 'test-private'); vi.stubEnv('TIMER_PUSH_SUBJECT', 'https://example.com');
    db = (await import('@/lib/prisma')).prisma;
    store = await import('@/lib/timers/push/store');
    delivery = await import('@/lib/timers/push/deliver');
  });
  beforeEach(async () => {
    await db.timerPushSubscription.deleteMany({ where: { owner_id: { startsWith: 'push-test-' } } });
    mocks.send.mockReset().mockResolvedValue({ statusCode: 201 });
  });
  afterAll(async () => { await db?.timerPushSubscription.deleteMany({ where: { owner_id: { startsWith: 'push-test-' } } }); await db?.$disconnect(); vi.unstubAllEnvs(); });
  async function subscription() {
    return store.registerTimerSubscription('push-test-alice', { endpoint: `https://fcm.googleapis.com/fcm/send/test-${crypto.randomUUID()}`, keys });
  }
  async function due() {
    const subscriptionId = await subscription();
    const result = await store.updateServerTimer('push-test-alice', 'timer-1', input(subscriptionId));
    await db.recipeTimerPush.update({ where: { id: result.timer.id }, data: { ends_at: new Date(Date.now() - 1000) } });
    return { id: result.timer.id, subscriptionId };
  }
  it('registers the same browser concurrently without duplicate subscriptions', async () => {
    const payload = { endpoint: `https://fcm.googleapis.com/fcm/send/test-${crypto.randomUUID()}`, keys };
    const ids = await Promise.all([store.registerTimerSubscription('push-test-alice', payload), store.registerTimerSubscription('push-test-alice', payload)]);
    expect(ids[0]).toBe(ids[1]);
  });
  it('does not transfer an endpoint or timer to a different signed-in owner', async () => {
    const id = await subscription();
    const record = await db.timerPushSubscription.findUniqueOrThrow({ where: { id } });
    await expect(store.registerTimerSubscription('push-test-bob', { endpoint: record.endpoint, keys })).rejects.toMatchObject({ statusCode: 409 });
    await expect(store.updateServerTimer('push-test-bob', 'timer-1', input(id))).rejects.toMatchObject({ statusCode: 404 });
  });
  it('rejects old requests after a pause and requires a new version for changed contents', async () => {
    const id = await subscription(); const first = input(id);
    await store.updateServerTimer('push-test-alice', 'timer-1', first);
    const paused = { ...first, version: 2, state: 'paused' as const, endsAt: null };
    await store.updateServerTimer('push-test-alice', 'timer-1', paused);
    expect((await store.updateServerTimer('push-test-alice', 'timer-1', first)).timer.state).toBe('paused');
    await expect(store.updateServerTimer('push-test-alice', 'timer-1', { ...paused, description: 'changed' })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('sends exactly once when two durable jobs reach the same timer concurrently', async () => {
    const { id } = await due();
    const results = await Promise.all([delivery.deliverTimerPush(id, 1), delivery.deliverTimerPush(id, 1)]);
    expect(results.sort()).toEqual(['obsolete', 'sent']);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect((await db.recipeTimerPush.findUniqueOrThrow({ where: { id } })).state).toBe('sent');
    const payload = JSON.parse(mocks.send.mock.calls[0][1]);
    expect(payload).toMatchObject({ timerId: 'timer-1', version: 1, url: '/recipe/555', type: 'RECIPE_TIMER_END' });
    expect(payload).not.toHaveProperty('subscription');
  });
  it('never sends an old job after an acknowledged cancellation or resume', async () => {
    const { id, subscriptionId } = await due();
    await store.updateServerTimer('push-test-alice', 'timer-1', { ...input(subscriptionId, 2), state: 'cancelled', endsAt: null });
    expect(await delivery.deliverTimerPush(id, 1)).toBe('obsolete');
    await store.updateServerTimer('push-test-alice', 'timer-1', input(subscriptionId, 3));
    expect(await delivery.deliverTimerPush(id, 1)).toBe('obsolete');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('serializes a simultaneous cancellation with in-flight delivery', async () => {
    const { id, subscriptionId } = await due();
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    mocks.send.mockImplementationOnce(() => { began(); return new Promise<void>(resolve => { release = resolve; }); });
    const sending = delivery.deliverTimerPush(id, 1);
    await started;
    let acknowledged = false;
    const cancelling = store.updateServerTimer('push-test-alice', 'timer-1', { ...input(subscriptionId, 2), state: 'cancelled', endsAt: null }).then(() => { acknowledged = true; });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(acknowledged).toBe(false);
    release(); await sending; await cancelling;
    expect(await delivery.deliverTimerPush(id, 1)).toBe('obsolete');
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('drops an expired notification instead of sending a late cooking reminder', async () => {
    const { id } = await due();
    await db.recipeTimerPush.update({ where: { id }, data: { ends_at: new Date(Date.now() - 121000) } });
    expect(await delivery.deliverTimerPush(id, 1)).toBe('expired'); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('removes expired subscriptions and all their obsolete timer records', async () => {
    const { id, subscriptionId } = await due(); mocks.send.mockRejectedValue({ statusCode: 410 });
    expect(await delivery.deliverTimerPush(id, 1)).toBe('unsubscribed');
    expect(await db.timerPushSubscription.findUnique({ where: { id: subscriptionId } })).toBeNull();
    expect(await delivery.deliverTimerPush(id, 1)).toBe('obsolete');
  });
  it('rolls back transient delivery failures so the durable step can retry', async () => {
    const { id } = await due(); mocks.send.mockRejectedValueOnce({ statusCode: 503 });
    await expect(delivery.deliverTimerPush(id, 1)).rejects.toThrow('temporarily unavailable');
    expect((await db.recipeTimerPush.findUniqueOrThrow({ where: { id } })).state).toBe('running');
    expect(await delivery.deliverTimerPush(id, 1)).toBe('sent');
  });
  it('does not send before the deadline', async () => {
    const subscriptionId = await subscription();
    const result = await store.updateServerTimer('push-test-alice', 'timer-1', input(subscriptionId));
    await expect(delivery.deliverTimerPush(result.timer.id, 1)).rejects.toThrow('not due');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

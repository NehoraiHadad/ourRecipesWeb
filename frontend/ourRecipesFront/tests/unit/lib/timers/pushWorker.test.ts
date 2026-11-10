import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let factory: IDBFactory;
let events: Record<string, (event: any) => void>;
let show: ReturnType<typeof vi.fn>;
let navigate: ReturnType<typeof vi.fn>;
let focus: ReturnType<typeof vi.fn>;
const payload = () => ({ type: 'RECIPE_TIMER_END', timerId: 'timer-1', version: 2,
  title: 'לחם — הזמן הסתיים', body: 'התפחה', url: '/recipe/555', expiresAt: Date.now() + 60000, silent: false });
async function fire(type: string, data: any) {
  const pending: Promise<unknown>[] = [];
  const event = type === 'notificationclick'
    ? { notification: { close: vi.fn(), data }, waitUntil: (promise: Promise<unknown>) => pending.push(promise) }
    : { data: type === 'push' ? { json: () => data } : data, waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
  events[type](event); await Promise.all(pending);
}
async function localRecord(record: Record<string, unknown>) {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('TimersDB', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('timers', { keyPath: 'id' });
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('timers', 'readwrite'); tx.objectStore('timers').put(record);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  });
}
beforeEach(() => {
  factory = new IDBFactory(); events = {}; show = vi.fn().mockResolvedValue(undefined);
  navigate = vi.fn().mockResolvedValue(undefined); focus = vi.fn().mockResolvedValue(undefined);
  const scope = {
    addEventListener: (name: string, handler: (event: any) => void) => { events[name] = handler; },
    registration: { showNotification: show }, location: { origin: 'https://recipes.example' },
    clients: { matchAll: async () => [{ url: 'https://recipes.example/', navigate, focus }], openWindow: vi.fn() },
    skipWaiting: async () => {}
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self: scope, indexedDB: factory, URL, console });
});
describe('timer Push service worker', () => {
  it('displays a valid push with a same-app recipe link and mute preference', async () => {
    await fire('push', { ...payload(), silent: true });
    expect(show).toHaveBeenCalledWith('לחם — הזמן הסתיים', expect.objectContaining({ silent: true, renotify: false, data: { url: '/recipe/555' } }));
  });
  it('deduplicates concurrent deliveries, including a retry after dismissal', async () => {
    await Promise.all([fire('push', payload()), fire('push', payload())]);
    await fire('push', payload()); expect(show).toHaveBeenCalledOnce();
  });
  it('suppresses a stale push using the locally persisted pause even if the server missed it', async () => {
    await localRecord({ id: 'timer-1', isPaused: true, alarmVersion: 3 });
    await fire('push', payload()); expect(show).not.toHaveBeenCalled();
  });
  it('suppresses an old generation after resume and pending deletion', async () => {
    await localRecord({ id: 'timer-1', isPaused: false, alarmVersion: 3 });
    await fire('push', payload()); expect(show).not.toHaveBeenCalled();
    await localRecord({ id: 'timer-1', pendingDelete: true, alarmVersion: 2 });
    await fire('push', payload()); expect(show).not.toHaveBeenCalled();
  });
  it('allows the current completed generation, without reviving its timer UI', async () => {
    await localRecord({ id: 'timer-1', alarmVersion: 2, isCompleted: true, isPaused: false });
    await fire('push', payload()); expect(show).toHaveBeenCalledOnce();
  });
  it('drops expired, malformed and unrelated pushes', async () => {
    await fire('push', { ...payload(), expiresAt: Date.now() - 1 });
    await fire('push', { ...payload(), version: 'bad' });
    await fire('push', { type: 'other' });
    expect(show).not.toHaveBeenCalled();
  });
  it('can retry if displaying the first notification fails', async () => {
    show.mockRejectedValueOnce(new Error('temporary display failure'));
    await expect(fire('push', payload())).rejects.toThrow();
    await fire('push', payload()); expect(show).toHaveBeenCalledTimes(2);
  });
  it('keeps legacy foreground messages working and prevents navigation outside the app', async () => {
    await localRecord({ id: 'timer-1', alarmVersion: 2, isPaused: false });
    await fire('message', { type: 'TIMER_END', timerId: 'timer-1', description: 'done' });
    expect(show).toHaveBeenCalledOnce();
    await fire('notificationclick', { url: '//evil.example' });
    expect(navigate).toHaveBeenCalledWith('https://recipes.example/'); expect(focus).toHaveBeenCalledOnce();
  });
});

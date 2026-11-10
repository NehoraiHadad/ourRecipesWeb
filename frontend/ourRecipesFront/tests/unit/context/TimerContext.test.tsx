import React, { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerProvider, useTimer, type Timer } from '@/context/TimerContext';
import type { AlarmPlatform } from '@/lib/timers/nativeAlarms';

const mocks = vi.hoisted(() => ({
  records: new Map<string, Timer>(),
  notify: vi.fn(), send: vi.fn(),
  save: vi.fn(), remove: vi.fn(),
  platform: 'web' as AlarmPlatform, syncAlarm: vi.fn(), cancelAlarm: vi.fn(), requestPermission: vi.fn(),
  push: { status: 'off', subscriptionId: null as string | null, errorStatus: null, enable: vi.fn(), disable: vi.fn() },
  syncPush: vi.fn(),
}));
vi.mock('@/hooks/useTimerPush', () => ({ useTimerPush: () => mocks.push }));
vi.mock('@/lib/timers/webPushClient', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/timers/webPushClient')>(), synchronizeTimerPush: mocks.syncPush,
}));
vi.mock('@/lib/timers/nativeAlarms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/timers/nativeAlarms')>();
  return { ...actual, alarmPlatform: () => mocks.platform, syncNativeAlarm: mocks.syncAlarm,
    cancelNativeAlarm: mocks.cancelAlarm, requestNativeAlarmPermission: mocks.requestPermission };
});
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: async () => {} }) } }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: mocks.notify }) }));
vi.mock('@/hooks/useServiceWorker', () => ({ useServiceWorker: () => ({ sendNotification: mocks.send, requestNotificationPermission: vi.fn() }) }));
vi.mock('@/db/timerDB', () => ({ timerDB: {
  init: async () => {},
  getAllTimers: async () => Array.from(mocks.records.values()),
  getSettings: async () => ({ isSoundMuted: true }),
  saveTimer: async (timer: Timer) => { mocks.save(timer); mocks.records.set(timer.id, { ...timer }); },
  removeTimer: async (id: string) => { mocks.remove(id); mocks.records.delete(id); },
  saveSettings: async () => {},
} }));
const wrapper = ({ children }: { children: React.ReactNode }) => <StrictMode><TimerProvider>{children}</TimerProvider></StrictMode>;
const newTimer = { timeLeft: 120, recipeId: '1', recipeName: 'לחם', description: 'התפחה', stepNumber: 1 };

beforeEach(() => {
  mocks.records.clear();
  vi.clearAllMocks();
  mocks.platform = 'web';
  mocks.syncAlarm.mockReset().mockResolvedValue('scheduled');
  mocks.cancelAlarm.mockReset().mockResolvedValue(undefined);
  mocks.requestPermission.mockReset().mockResolvedValue('scheduled');
  mocks.push.status = 'off'; mocks.push.subscriptionId = null;
  mocks.push.enable.mockReset().mockResolvedValue(true);
  mocks.push.disable.mockReset().mockResolvedValue(undefined);
  mocks.syncPush.mockReset().mockImplementation(async (timer: Timer) => ({ state: timer.pendingDelete ? 'cancelled' : timer.isPaused ? 'paused' : 'scheduled' }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

describe('native timer lifecycle', () => {
  beforeEach(() => { mocks.platform = 'android'; });

  it('schedules start/resume, cancels pause/delete, and retains one OS notification ID', async () => {
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let id = '';
    await act(async () => { id = await result.current.addTimer(newTimer); });
    const notificationId = result.current.timers[0].notificationId;
    expect(notificationId).toBeGreaterThan(0);
    expect(result.current.timers[0].alarmState).toBe('scheduled');
    mocks.syncAlarm.mockResolvedValueOnce('paused');
    await act(async () => { await result.current.pauseTimer(id); });
    expect(mocks.syncAlarm.mock.lastCall?.[0]).toMatchObject({ isPaused: true, endsAt: null, notificationId });
    await act(async () => { await result.current.resumeTimer(id); });
    expect(mocks.syncAlarm.mock.lastCall?.[0]).toMatchObject({ isPaused: false, notificationId });
    await act(async () => { await result.current.removeTimer(id); });
    expect(mocks.cancelAlarm.mock.lastCall?.[0]).toMatchObject({ id, notificationId });
    expect(mocks.records.size).toBe(0);
  });

  it('cancels a late schedule result after the user has already paused', async () => {
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let release!: (state: string) => void;
    mocks.syncAlarm.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let adding!: Promise<string>;
    act(() => { adding = result.current.addTimer(newTimer); });
    await waitFor(() => expect(mocks.syncAlarm).toHaveBeenCalledOnce());
    const id = result.current.timers[0].id;
    mocks.syncAlarm.mockResolvedValueOnce('paused');
    let pausing!: Promise<void>;
    act(() => { pausing = result.current.pauseTimer(id); });
    await act(async () => { release('scheduled'); await adding; await pausing; });
    expect(result.current.timers[0]).toMatchObject({ isPaused: true, endsAt: null, alarmState: 'paused' });
    expect(mocks.cancelAlarm).toHaveBeenCalledOnce();
    expect(mocks.records.get(id)).toMatchObject({ isPaused: true, alarmState: 'paused' });
  });

  it('leaves the due OS notification in place and avoids a second browser notification', async () => {
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    vi.useFakeTimers(); vi.setSystemTime(1000);
    await act(async () => { await result.current.addTimer(newTimer); });
    vi.setSystemTime(130000);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(result.current.timers).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.cancelAlarm).not.toHaveBeenCalled();
    expect(mocks.records.size).toBe(0);
  });

  it('migrates restored timers and reconciles without prompting for permission', async () => {
    mocks.records.set('restored', { ...newTimer, id: 'restored', isPaused: false, endsAt: Date.now() + 60000 });
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.timers[0]?.alarmState).toBe('scheduled'));
    expect(result.current.timers[0].notificationId).toBeGreaterThan(0);
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });

  it('keeps a timer available for retry if cancelling the native alert fails', async () => {
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let id = '';
    await act(async () => { id = await result.current.addTimer(newTimer); });
    mocks.cancelAlarm.mockRejectedValueOnce(new Error('device error'));
    await act(async () => { await result.current.removeTimer(id); });
    expect(result.current.timers[0]).toMatchObject({ id, alarmState: 'error' });
    expect(mocks.records.has(id)).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('לא בוטלה') }));
  });

  it('reports a scheduling failure without claiming that a background alarm exists', async () => {
    mocks.syncAlarm.mockRejectedValueOnce(new Error('device error'));
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await act(async () => { await result.current.addTimer(newTimer); });
    expect(result.current.timers[0].alarmState).toBe('error');
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('web push timer lifecycle', () => {
  beforeEach(() => { mocks.push.status = 'ready'; mocks.push.subscriptionId = 'subscription'; });

  it('confirms scheduling, changes the generation on pause/resume and cancels deletion', async () => {
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let id = '';
    await act(async () => { id = await result.current.addTimer(newTimer); });
    expect(result.current.timers[0]).toMatchObject({ pushState: 'scheduled', alarmVersion: 1 });
    await act(async () => { await result.current.pauseTimer(id); });
    expect(result.current.timers[0]).toMatchObject({ pushState: 'paused', alarmVersion: 2 });
    await act(async () => { await result.current.resumeTimer(id); });
    expect(result.current.timers[0]).toMatchObject({ pushState: 'scheduled', alarmVersion: 3 });
    await act(async () => { await result.current.removeTimer(id); });
    expect(mocks.syncPush.mock.lastCall?.[0]).toMatchObject({ pendingDelete: true, alarmVersion: 4 });
    expect(result.current.timers).toHaveLength(0);
    expect(mocks.records.has(id)).toBe(false);
  });

  it('retains a failed cancellation across reload and retries it on reconnection', async () => {
    const first = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(first.result.current.isReady).toBe(true));
    let id = '';
    await act(async () => { id = await first.result.current.addTimer(newTimer); });
    mocks.syncPush.mockRejectedValue(new Error('offline'));
    await act(async () => { await first.result.current.removeTimer(id); });
    expect(mocks.records.get(id)).toMatchObject({ pendingDelete: true, pushState: 'error' });
    first.unmount();
    const second = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(second.result.current.isReady).toBe(true));
    await waitFor(() => expect(second.result.current.timers[0]?.pushState).toBe('error'));
    mocks.syncPush.mockResolvedValue({ state: 'cancelled' });
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(second.result.current.timers).toHaveLength(0));
    expect(mocks.records.has(id)).toBe(false);
  });

  it('removes pending deletions when unsubscribing while keeping active timers', async () => {
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let id = '';
    await act(async () => { id = await result.current.addTimer(newTimer); await result.current.addTimer(newTimer); });
    mocks.syncPush.mockRejectedValue(new Error('offline'));
    await act(async () => { await result.current.removeTimer(id); });
    await act(async () => { await result.current.disablePush(); });
    expect(mocks.push.disable).toHaveBeenCalledOnce();
    expect(result.current.timers).toHaveLength(1);
    expect(result.current.timers[0].pushSubscriptionId).toBeUndefined();
    expect(mocks.records.has(id)).toBe(false);
  });
});

describe('persisted recipe timers', () => {
  it('starts immediately, catches up on focus, and restores after remount', async () => {
    const first = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(first.result.current.isReady).toBe(true));
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    await act(async () => { await first.result.current.addTimer(newTimer); });
    const id = first.result.current.timers[0].id;
    expect(first.result.current.timers[0]).toMatchObject({ isPaused: false, endsAt: 121000 });
    vi.setSystemTime(91000); // No interval callbacks: simulate OS suspension.
    act(() => window.dispatchEvent(new Event('focus')));
    expect(first.result.current.timers[0].timeLeft).toBe(30);
    first.unmount();
    vi.useRealTimers();
    const now = vi.spyOn(Date, 'now').mockReturnValue(101000);
    const restored = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(restored.result.current.isReady).toBe(true));
    expect(restored.result.current.timers[0]).toMatchObject({ id, timeLeft: 20, endsAt: 121000 });
    now.mockRestore();
  });

  it('notifies exactly once for a timer that expired while closed, even under StrictMode', async () => {
    mocks.records.set('expired', { ...newTimer, id: 'expired', isPaused: false, endsAt: Date.now() - 5000 });
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.timers).toHaveLength(0);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.records.size).toBe(0));
  });

  it('keeps a paused timer unchanged across suspension and avoids per-second DB writes', async () => {
    const { result } = renderHook(useTimer, { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let id = '';
    await act(async () => { id = await result.current.addTimer(newTimer); });
    vi.setSystemTime(31000);
    await act(async () => { await result.current.pauseTimer(id); });
    expect(result.current.timers[0].timeLeft).toBe(90);
    const writes = mocks.save.mock.calls.length;
    act(() => { vi.advanceTimersByTime(60000); });
    expect(result.current.timers[0].timeLeft).toBe(90);
    expect(mocks.save).toHaveBeenCalledTimes(writes);
    await act(async () => { await result.current.resumeTimer(id); });
    expect(result.current.timers[0].endsAt).toBe(Date.now() + 90000);
  });
});

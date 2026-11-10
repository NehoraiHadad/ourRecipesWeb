import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alarmPlatform, allocateNotificationId, cancelNativeAlarm, requestNativeAlarmPermission, syncNativeAlarm, type AlarmTimer } from '@/lib/timers/nativeAlarms';

const mocks = vi.hoisted(() => ({
  platform: 'android', available: true,
  api: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), checkExactNotificationSetting: vi.fn(),
    changeExactNotificationSetting: vi.fn(), getPending: vi.fn(), createChannel: vi.fn(), schedule: vi.fn(), cancel: vi.fn() }
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform, isPluginAvailable: () => mocks.available } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: new Proxy(mocks.api, {
  get(target, property) {
    if (property === 'then') throw new Error('A native plugin Proxy must not be assimilated as a Promise');
    return Reflect.get(target, property);
  }
}) }));
const timer = (): AlarmTimer => ({ id: 'timer-uuid', recipeId: 'recipe-1', recipeName: 'לחם', description: 'התפחה', notificationId: 42, endsAt: Date.now() + 60000, isPaused: false });

beforeEach(() => {
  vi.resetAllMocks(); mocks.platform = 'android'; mocks.available = true;
  mocks.api.checkPermissions.mockResolvedValue({ display: 'granted' });
  mocks.api.requestPermissions.mockResolvedValue({ display: 'granted' });
  mocks.api.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' });
  mocks.api.changeExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' });
  mocks.api.getPending.mockResolvedValue({ notifications: [] });
  mocks.api.schedule.mockImplementation(async ({ notifications }) => ({ notifications: notifications.map(({ id }: { id: number }) => ({ id })) }));
  mocks.api.cancel.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('OS-scheduled recipe alerts', () => {
  it('keeps the website a website and never calls a native plugin there', async () => {
    mocks.platform = 'web';
    expect(alarmPlatform()).toBe('web');
    expect(await syncNativeAlarm(timer(), false)).toBe('web');
    await cancelNativeAlarm(timer());
    expect(mocks.api.schedule).not.toHaveBeenCalled();
    expect(mocks.api.cancel).not.toHaveBeenCalled();
  });

  it('schedules the absolute deadline once with a stable ID and exact/idle options', async () => {
    const record = timer();
    expect(await syncNativeAlarm(record, false)).toBe('scheduled');
    expect(mocks.api.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({
      id: 42, schedule: { at: new Date(record.endsAt!), allowWhileIdle: true },
      sound: 'timer_end.wav', isExactMandatory: true,
      extra: { recipeTimerId: record.id, recipeId: record.recipeId, endsAt: record.endsAt }
    })] });
    expect(mocks.api.requestPermissions).not.toHaveBeenCalled();
  });

  it('does not claim background protection when notification permission is missing', async () => {
    mocks.api.checkPermissions.mockResolvedValue({ display: 'denied' });
    expect(await syncNativeAlarm(timer(), false)).toBe('permission-required');
    expect(mocks.api.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.api.schedule).not.toHaveBeenCalled();
  });

  it('never silently substitutes an inexact Android alarm', async () => {
    mocks.api.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
    expect(await syncNativeAlarm(timer(), false)).toBe('exact-permission-required');
    expect(mocks.api.changeExactNotificationSetting).not.toHaveBeenCalled();
    expect(mocks.api.schedule).not.toHaveBeenCalled();
  });

  it('opens native permission settings only from the explicit permission action', async () => {
    mocks.api.checkPermissions.mockResolvedValue({ display: 'prompt' });
    mocks.api.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
    expect(await requestNativeAlarmPermission()).toBe('scheduled');
    expect(mocks.api.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.api.changeExactNotificationSetting).toHaveBeenCalledOnce();
  });

  it('cancels a paused timer even when notification permission was subsequently revoked', async () => {
    mocks.api.checkPermissions.mockResolvedValue({ display: 'denied' });
    expect(await syncNativeAlarm({ ...timer(), isPaused: true, endsAt: null }, false)).toBe('paused');
    expect(mocks.api.cancel).toHaveBeenCalledWith({ notifications: [{ id: 42 }] });
  });

  it('does not cancel a due OS alarm in a race with its delivery', async () => {
    expect(await syncNativeAlarm({ ...timer(), endsAt: Date.now() - 1 }, false)).toBe('expired');
    expect(mocks.api.schedule).not.toHaveBeenCalled();
    expect(mocks.api.cancel).not.toHaveBeenCalled();
  });

  it('does not overwrite a notification belonging to another timer', async () => {
    mocks.api.getPending.mockResolvedValue({ notifications: [{ id: 42, extra: { recipeTimerId: 'other' } }] });
    await expect(syncNativeAlarm(timer(), false)).rejects.toThrow('already belongs');
    expect(mocks.api.schedule).not.toHaveBeenCalled();
  });

  it('keeps an existing timer ID across rescheduling', async () => {
    const record = timer();
    mocks.api.getPending.mockResolvedValue({ notifications: [{ id: 42, extra: { recipeTimerId: record.id } }] });
    expect(await syncNativeAlarm(record, false)).toBe('scheduled');
    expect(mocks.api.schedule.mock.calls[0][0].notifications[0].id).toBe(42);
  });

  it('cancels an unexpected inexact fallback and reports failure', async () => {
    mocks.api.schedule.mockResolvedValue({ notifications: [{ id: 42 }], warning: { code: 'inexact' } });
    expect(await syncNativeAlarm(timer(), false)).toBe('error');
    expect(mocks.api.cancel).toHaveBeenCalledOnce();
  });

  it('uses a quiet Android channel and no iOS sound when muted', async () => {
    await syncNativeAlarm(timer(), true);
    expect(mocks.api.createChannel).toHaveBeenCalledWith(expect.objectContaining({ importance: 2, vibration: false }));
    mocks.platform = 'ios';
    await syncNativeAlarm(timer(), true);
    expect(mocks.api.schedule.mock.lastCall![0].notifications[0]).toMatchObject({ silent: true, sound: undefined });
  });

  it('does not require Android exact alarm permission on iOS', async () => {
    mocks.platform = 'ios';
    expect(await syncNativeAlarm(timer(), false)).toBe('scheduled');
    expect(mocks.api.checkExactNotificationSetting).not.toHaveBeenCalled();
    expect(mocks.api.createChannel).not.toHaveBeenCalled();
  });

  it('fails visibly when an installed wrapper lacks the native plugin', async () => {
    mocks.available = false;
    await expect(syncNativeAlarm(timer(), false)).rejects.toThrow('plugin is missing');
  });

  it('allocates a positive 32-bit ID without reusing a live one', () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    random.mockReturnValueOnce(new Uint32Array([42])).mockReturnValueOnce(new Uint32Array([43]));
    expect(allocateNotificationId([42])).toBe(43);
  });
});

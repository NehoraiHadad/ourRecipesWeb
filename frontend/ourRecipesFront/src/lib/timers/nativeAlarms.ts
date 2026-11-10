import { Capacitor } from '@capacitor/core';

export type AlarmPlatform = 'web' | 'android' | 'ios';
export type NativeAlarmState = 'web' | 'scheduled' | 'paused' | 'expired' | 'permission-required' | 'exact-permission-required' | 'error';

export interface AlarmTimer {
  id: string;
  recipeId: string;
  recipeName: string;
  description: string;
  isPaused?: boolean;
  endsAt?: number | null;
  notificationId?: number;
}

export function alarmPlatform(): AlarmPlatform {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
}

/** Positive 32-bit IDs, independent of UUID hashes. Never reuse a live timer's ID. */
export function allocateNotificationId(used: number[]): number {
  const occupied = new Set(used);
  let id: number;
  do { id = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff; }
  while (id === 0 || occupied.has(id));
  return id;
}

async function plugin() {
  if (!Capacitor.isPluginAvailable('LocalNotifications')) throw new Error('Native notification plugin is missing');
  // Return the module, not the plugin Proxy: an async function assimilates a
  // returned Proxy's `then` property as if it were a Promise/native method.
  return import('@capacitor/local-notifications');
}

export async function requestNativeAlarmPermission(): Promise<NativeAlarmState> {
  const platform = alarmPlatform();
  if (platform === 'web') return 'web';
  const { LocalNotifications: api } = await plugin();
  let permission = await api.checkPermissions();
  if (permission.display !== 'granted') permission = await api.requestPermissions();
  if (permission.display !== 'granted') return 'permission-required';
  if (platform === 'android') {
    let exact = await api.checkExactNotificationSetting();
    if (exact.exact_alarm !== 'granted') exact = await api.changeExactNotificationSetting();
    if (exact.exact_alarm !== 'granted') return 'exact-permission-required';
  }
  return 'scheduled';
}

export async function cancelNativeAlarm(timer: AlarmTimer): Promise<void> {
  if (alarmPlatform() === 'web' || !timer.notificationId) return;
  const { LocalNotifications: api } = await plugin();
  await api.cancel({ notifications: [{ id: timer.notificationId }] });
}

/** Schedule once in the OS. No background JS, push server, or polling is involved. */
export async function syncNativeAlarm(timer: AlarmTimer, muted: boolean): Promise<NativeAlarmState> {
  const platform = alarmPlatform();
  if (platform === 'web') return 'web';
  if (timer.isPaused) { await cancelNativeAlarm(timer); return 'paused'; }
  if (timer.endsAt == null || timer.endsAt <= Date.now()) return 'expired';
  if (!timer.notificationId) throw new Error('Timer has no native notification ID');
  const { LocalNotifications: api } = await plugin();
  // Restoration and rescheduling never open a system permission dialog.
  if ((await api.checkPermissions()).display !== 'granted') return 'permission-required';
  if (platform === 'android' && (await api.checkExactNotificationSetting()).exact_alarm !== 'granted') {
    return 'exact-permission-required';
  }
  const pending = await api.getPending();
  const existing = pending.notifications.find(item => item.id === timer.notificationId);
  if (existing && existing.extra?.recipeTimerId !== timer.id) {
    throw new Error('Notification ID already belongs to another alarm');
  }
  const channelId = muted ? 'recipe-timers-silent-v1' : 'recipe-timers-sound-v1';
  if (platform === 'android') {
    await api.createChannel({
      id: channelId, name: muted ? 'טיימרים ללא צליל' : 'טיימרים לבישול',
      description: 'סיום טיימרים של מתכונים', importance: muted ? 2 : 5, visibility: 1,
      vibration: !muted, sound: muted ? undefined : 'timer_end.wav'
    });
  }
  // Permissions/settings can take time. Do not schedule a date that has already passed.
  if (timer.endsAt <= Date.now()) return 'expired';
  const result = await api.schedule({ notifications: [{
    id: timer.notificationId,
    title: `${timer.recipeName} — הזמן הסתיים`, body: timer.description,
    schedule: { at: new Date(timer.endsAt), allowWhileIdle: true },
    channelId, sound: muted ? undefined : 'timer_end.wav', silent: muted,
    isExactNotification: true, isExactMandatory: true,
    // Use the OS notification in the foreground too; the page must not ring again.
    foreground: true,
    extra: { recipeTimerId: timer.id, recipeId: timer.recipeId, endsAt: timer.endsAt }
  }] });
  if (result.warning || !result.notifications.some(item => item.id === timer.notificationId)) {
    await cancelNativeAlarm(timer);
    return 'error';
  }
  return 'scheduled';
}

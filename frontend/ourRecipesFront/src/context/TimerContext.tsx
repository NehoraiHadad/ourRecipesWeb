'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNotification } from './NotificationContext';
import { timerDB } from '@/db/timerDB';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { changeClock, restoreClock } from '@/lib/timers/clock';
import { alarmPlatform, allocateNotificationId, cancelNativeAlarm, requestNativeAlarmPermission, syncNativeAlarm,
  type AlarmPlatform, type NativeAlarmState } from '@/lib/timers/nativeAlarms';
import { useTimerPush, type TimerPushStatus } from '@/hooks/useTimerPush';
import { synchronizeTimerPush, TimerPushClientError, type TimerPushState } from '@/lib/timers/webPushClient';

export interface Timer {
  id: string;
  recipeId: string;
  recipeName: string;
  stepNumber: number;
  timeLeft: number;
  description: string;
  isPaused?: boolean;
  endsAt?: number | null;
  notificationId?: number;
  alarmState?: NativeAlarmState;
  alarmVersion?: number;
  recipeUrl?: string;
  pushState?: TimerPushState;
  pushSubscriptionId?: string;
  pendingDelete?: boolean;
  isCompleted?: boolean;
}

type NewTimer = Omit<Timer, 'id' | 'isPaused' | 'endsAt' | 'notificationId' | 'alarmState' | 'alarmVersion' | 'pushState' | 'pushSubscriptionId' | 'pendingDelete' | 'isCompleted'>;
interface TimerContextType {
  isReady: boolean;
  timers: Timer[];
  getRecipeTimers: (recipeId: string) => Timer[];
  isSoundMuted: boolean;
  addTimer: (timer: NewTimer) => Promise<string>;
  removeTimer: (id: string) => Promise<void>;
  updateTimer: (id: string, updates: Partial<Timer>) => Promise<void>;
  pauseTimer: (id: string) => Promise<void>;
  resumeTimer: (id: string) => Promise<void>;
  toggleSound: () => Promise<void>;
  requestNotificationPermission: () => Promise<boolean>;
  keepScreenOn: boolean;
  setKeepScreenOn: (enabled: boolean) => void;
  screenLock: ReturnType<typeof useScreenWakeLock>;
  alarmPlatform: AlarmPlatform;
  pushStatus: TimerPushStatus;
  pushErrorStatus: number | null;
  disablePush: () => Promise<void>;
}

const TimerContext = createContext<TimerContextType | null>(null);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>([]);
  const timersRef = useRef<Timer[]>([]);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [keepScreenOn, setKeepScreenOn] = useState(false);
  const { addNotification } = useNotification();
  const { sendNotification, registration: workerRegistration } = useServiceWorker();
  const [platform, setPlatform] = useState<AlarmPlatform>('web');
  const webPush = useTimerPush();
  const mutedRef = useRef(false);
  const screenLock = useScreenWakeLock(keepScreenOn && timers.some(timer => !timer.isPaused));
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const writes = useRef(Promise.resolve());

  const publish = useCallback((next: Timer[]) => {
    timersRef.current = next;
    setTimers(next);
  }, []);

  // Serialize writes so a slow rename/pause can never overwrite a later resume/delete.
  // Countdown ticks do not write: the persisted deadline is sufficient for recovery.
  const persist = useCallback((write: () => Promise<void>) => {
    const operation = writes.current.then(write).then(() => true).catch(error => {
      console.error('Failed to persist timer:', error);
      addNotification({ message: 'לא ניתן לשמור את הטיימר במכשיר. ייתכן שלא ישוחזר לאחר סגירה.', type: 'error' });
      return false;
    });
    writes.current = operation.then(() => {});
    return operation;
  }, [addNotification]);

  const syncAlarm = useCallback((snapshot: Timer) => persist(async () => {
    const current = timersRef.current.find(timer => timer.id === snapshot.id);
    if (!current || current.alarmVersion !== snapshot.alarmVersion) return;
    if (alarmPlatform() === 'web') {
      const target = webPush.subscriptionId ?? snapshot.pushSubscriptionId;
      if (!target || (!webPush.subscriptionId && !snapshot.isPaused && !snapshot.pendingDelete)) return;
      let state: TimerPushState;
      try {
        state = (await synchronizeTimerPush(snapshot, target, mutedRef.current)).state;
      } catch (error) {
        if (snapshot.pendingDelete && error instanceof TimerPushClientError && error.status === 404) state = 'cancelled';
        else {
          state = 'error';
          addNotification({ message: 'לא ניתן לעדכן את ההתראה ברקע. נדרש חיבור לרשת; התראה קודמת עלולה עדיין להישלח.', type: 'warning', duration: 10000 });
        }
      }
      const latest = timersRef.current.find(timer => timer.id === snapshot.id);
      if (!latest || latest.alarmVersion !== snapshot.alarmVersion) return;
      if (snapshot.pendingDelete && state === 'cancelled') {
        publish(timersRef.current.filter(timer => timer.id !== snapshot.id));
        await timerDB.removeTimer(snapshot.id);
      } else {
        const updated = { ...latest, pushSubscriptionId: target, pushState: state };
        publish(timersRef.current.map(timer => timer.id === updated.id ? updated : timer));
        await timerDB.saveTimer(updated);
      }
      return;
    }
    let state: NativeAlarmState;
    try {
      state = await syncNativeAlarm(snapshot, mutedRef.current);
    } catch (error) {
      console.error('Native timer scheduling failed:', error);
      state = 'error';
      addNotification({ message: 'לא ניתן לעדכן את ההתראה במכשיר. יש לבדוק את מצב ההתראה בטיימר.', type: 'error' });
    }
    const latest = timersRef.current.find(timer => timer.id === snapshot.id);
    if (!latest || latest.alarmVersion !== snapshot.alarmVersion) {
      // A pause/delete/second edit happened while the OS call was in flight.
      await cancelNativeAlarm(snapshot);
      return;
    }
    const updated = { ...latest, alarmState: state === 'expired' && latest.alarmState === 'scheduled' ? 'scheduled' as const : state };
    publish(timersRef.current.map(timer => timer.id === updated.id ? updated : timer));
    await timerDB.saveTimer(updated);
  }), [persist, publish, addNotification, webPush.subscriptionId]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const nativePlatform = alarmPlatform();
        if (!cancelled) setPlatform(nativePlatform);
        await timerDB.init();
        const [saved, settings] = await Promise.all([timerDB.getAllTimers(), timerDB.getSettings()]);
        const ids = saved.flatMap(timer => timer.notificationId ? [timer.notificationId] : []);
        const restored = saved.filter(timer => !timer.isCompleted).map(timer => {
          const restoredTimer = { ...restoreClock(timer), alarmVersion: timer.alarmVersion ?? 1 };
          if (nativePlatform !== 'web' && !restoredTimer.notificationId) {
            restoredTimer.notificationId = allocateNotificationId(ids);
            ids.push(restoredTimer.notificationId);
          }
          return restoredTimer;
        });
        // Persist deadlines for legacy records before starting the display clock.
        await Promise.all(restored.map(timer => timerDB.saveTimer(timer)));
        await Promise.all(saved.filter(timer => timer.isCompleted && (timer.endsAt ?? 0) < Date.now() - 120000).map(timer => timerDB.removeTimer(timer.id)));
        if (cancelled) return;
        publish(restored);
        setIsSoundMuted(settings.isSoundMuted);
        mutedRef.current = settings.isSoundMuted;
      } catch (error) {
        console.error('Failed to initialize timer database:', error);
        if (!cancelled) addNotification({ message: 'שגיאה בטעינת הטיימרים', type: 'error', duration: 5000 });
      } finally {
        if (!cancelled) setIsInitialized(true);
      }
    };
    void init();
    return () => { cancelled = true; };
  }, [addNotification, publish]);

  // Resynchronize after settings changes, process restarts, and native app resume.
  // This only checks permissions; it never prompts when the user returns to the app.
  useEffect(() => {
    if (!isInitialized) return;
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    const reconcile = () => {
      if (!disposed && document.visibilityState !== 'hidden') {
        timersRef.current.forEach(timer => { void syncAlarm(timer); });
      }
    };
    reconcile();
    if (platform !== 'web') void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appStateChange', state => { if (state.isActive) reconcile(); });
      if (disposed) await handle.remove();
      else remove = () => handle.remove();
    }).catch(error => console.error('Could not listen for native resume:', error));
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      disposed = true;
      void remove?.();
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [isInitialized, platform, syncAlarm]);

  const requestNotificationPermission = async () => {
    if (platform === 'web') {
      const enabled = await webPush.enable();
      if (enabled) {
        await Promise.all(timersRef.current.map(syncAlarm));
        addNotification({ message: 'התראות ברקע הופעלו. נדרש חיבור לרשת לקבלתן.', type: 'success' });
      }
      return enabled;
    }
    try {
      const state = await requestNativeAlarmPermission();
      if (state !== 'scheduled') {
        addNotification({ message: state === 'permission-required' ? 'נדרשת הרשאה להתראות בהגדרות המכשיר.' : 'נדרשת הרשאה לתזמון מדויק של טיימרים בהגדרות המכשיר.', type: 'warning' });
        return false;
      }
      await Promise.all(timersRef.current.map(syncAlarm));
      return true;
    } catch (error) {
      console.error('Could not request native alarm permission:', error);
      addNotification({ message: 'לא ניתן להפעיל התראות במכשיר הזה.', type: 'error' });
      return false;
    }
  };

  const disablePush = async () => {
    try {
      await webPush.disable();
      const deleted = timersRef.current.filter(timer => timer.pendingDelete);
      const updated = timersRef.current.filter(timer => !timer.pendingDelete).map(timer => ({ ...timer, pushState: undefined, pushSubscriptionId: undefined }));
      publish(updated);
      await persist(async () => {
        await Promise.all(deleted.map(timer => timerDB.removeTimer(timer.id)));
        await Promise.all(updated.map(timer => timerDB.saveTimer(timer)));
      });
    } catch { addNotification({ message: 'לא ניתן לבטל את ההתראות כרגע. נסו שוב.', type: 'error' }); }
  };

  const addTimer = async (timer: NewTimer) => {
    if (!isInitialized) return '';
    if (!Number.isFinite(timer.timeLeft) || timer.timeLeft <= 0) return '';
    const newTimer: Timer = {
      ...timer, id: crypto.randomUUID(), isPaused: false,
      endsAt: Date.now() + timer.timeLeft * 1000,
      notificationId: platform === 'web' ? undefined : allocateNotificationId(timersRef.current.flatMap(item => item.notificationId ? [item.notificationId] : [])),
      alarmVersion: 1
    };
    // Prepare audio from the start-button gesture where browser policy permits it.
    if (!soundRef.current) {
      soundRef.current = new Audio('/sounds/timer-end.mp3');
      const sound = soundRef.current;
      sound.muted = true;
      void sound.play().then(() => {
        sound.pause();
        sound.currentTime = 0;
        sound.muted = false;
      }).catch(() => { sound.muted = false; });
    }
    publish([...timersRef.current, newTimer]);
    const saved = await persist(() => timerDB.saveTimer(newTimer));
    if (saved) await syncAlarm(newTimer);
    return newTimer.id;
  };

  const removeTimer = async (id: string) => {
    const removed = timersRef.current.find(timer => timer.id === id);
    if (!removed) return;
    if (platform === 'web' && (webPush.subscriptionId || removed.pushSubscriptionId)) {
      const pending = { ...changeClock(removed, { isPaused: true }), pendingDelete: true,
        alarmVersion: (removed.alarmVersion ?? 0) + 1, pushState: 'pending' as const,
        pushSubscriptionId: webPush.subscriptionId ?? removed.pushSubscriptionId };
      publish(timersRef.current.map(timer => timer.id === id ? pending : timer));
      const saved = await persist(() => timerDB.saveTimer(pending));
      if (saved) await syncAlarm(pending);
      return;
    }
    publish(timersRef.current.filter(timer => timer.id !== id));
    await persist(async () => {
      try { await cancelNativeAlarm(removed); }
      catch (error) {
        publish([...timersRef.current, { ...removed, alarmState: 'error' }]);
        addNotification({ message: 'ההתראה לא בוטלה. הטיימר נשאר ברשימה כדי שתוכלו לנסות שוב.', type: 'error' });
        throw error;
      }
      await timerDB.removeTimer(id);
    });
  };

  const updateTimer = async (id: string, updates: Partial<Timer>) => {
    const timer = timersRef.current.find(timer => timer.id === id);
    if (!timer || timer.pendingDelete) return;
    const updated = { ...changeClock(timer, updates), alarmVersion: (timer.alarmVersion ?? 0) + 1,
      pushState: timer.pushSubscriptionId ? 'pending' as const : undefined };
    publish(timersRef.current.map(item => item.id === id ? updated : item));
    const saved = await persist(() => timerDB.saveTimer(updated));
    if (saved) await syncAlarm(updated);
  };

  const toggleSound = async () => {
    const muted = !isSoundMuted;
    setIsSoundMuted(muted);
    mutedRef.current = muted;
    await persist(() => timerDB.saveSettings({ isSoundMuted: muted, notificationsEnabled: false }));
    if (platform !== 'web' || webPush.subscriptionId) {
      const updated = timersRef.current.map(timer => ({ ...timer, alarmVersion: (timer.alarmVersion ?? 0) + 1,
        pushState: timer.pushSubscriptionId ? 'pending' as const : undefined }));
      publish(updated);
      await Promise.all(updated.map(syncAlarm));
    }
  };

  useEffect(() => {
    if (!isInitialized) return;
    const refresh = () => {
      const now = Date.now();
      const updated = timersRef.current.map(timer => restoreClock(timer, now));
      const completed = updated.filter(timer => !timer.isPaused && !timer.pendingDelete && timer.timeLeft === 0);
      // Remove before notifying, so rerenders/focus events cannot notify twice.
      if (updated.length) publish(updated.filter(timer => !completed.includes(timer)));
      for (const timer of completed) {
        // Let the OS deliver its due notification. Cancelling at the deadline races delivery.
        void persist(() => timer.pushSubscriptionId ? timerDB.saveTimer({ ...timer, isCompleted: true }) : timerDB.removeTimer(timer.id));
        const nativeWillNotify = alarmPlatform() !== 'web' && timer.alarmState === 'scheduled';
        const webWillNotify = alarmPlatform() === 'web' && Boolean(workerRegistration) && 'Notification' in window && Notification.permission === 'granted';
        const osWillNotify = nativeWillNotify || webWillNotify;
        if (!isSoundMuted && !osWillNotify) {
          const sound = soundRef.current ?? new Audio('/sounds/timer-end.mp3');
          soundRef.current = sound;
          void sound.play().catch(() => {});
        }
        if (!osWillNotify && 'vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        // The worker shares a durable receipt between foreground and server Push,
        // so either can alert first without a second notification on retry.
        if (!nativeWillNotify) void sendNotification(`${timer.recipeName}: ${timer.description}`, timer.id, timer.alarmVersion, isSoundMuted, timer.recipeUrl);
        addNotification({ message: `${timer.recipeName} - טיימר ${timer.description} הסתיים!`, type: 'info', duration: 10000 });
      }
    };
    refresh();
    const interval = setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isInitialized, isSoundMuted, sendNotification, workerRegistration, addNotification, persist, publish]);

  return (
    <TimerContext.Provider value={{
      isReady: isInitialized,
      timers, getRecipeTimers: recipeId => timers.filter(timer => timer.recipeId === recipeId),
      isSoundMuted, addTimer, removeTimer, updateTimer,
      pauseTimer: id => updateTimer(id, { isPaused: true }),
      resumeTimer: id => updateTimer(id, { isPaused: false }),
      toggleSound, requestNotificationPermission, keepScreenOn, setKeepScreenOn, screenLock, alarmPlatform: platform,
      pushStatus: webPush.status, pushErrorStatus: webPush.errorStatus, disablePush
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
}

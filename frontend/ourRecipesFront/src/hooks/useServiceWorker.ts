import { useCallback, useEffect, useState } from 'react';
import { useNotification } from '@/context/NotificationContext';

export function useServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let disposed = false;
    void navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(ready => { if (!disposed) setRegistration(ready); })
      .catch(error => console.error('Service Worker registration failed:', error));
    return () => { disposed = true; };
  }, []);

  // Call only from an explicit user gesture, never after a timer finishes.
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      addNotification({ message: 'הדפדפן הזה אינו תומך בהתראות. ב-iPhone ייתכן שנדרשת התקנה במסך הבית.', type: 'info' });
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      addNotification({
        message: permission === 'granted' ? 'התראות הופעלו כשהאפליקציה פעילה. אין הבטחה לצלצול כשהיא סגורה.' : 'לא ניתנה הרשאה להתראות',
        type: permission === 'granted' ? 'success' : 'info'
      });
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }, [addNotification]);

  const sendNotification = useCallback(async (description: string, timerId: string, version = 0, silent = false, url = '/') => {
    if (!registration || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      registration.active?.postMessage({ type: 'TIMER_END', description, timerId, version, silent, url });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }, [registration]);

  return { registration, sendNotification, requestNotificationPermission };
}

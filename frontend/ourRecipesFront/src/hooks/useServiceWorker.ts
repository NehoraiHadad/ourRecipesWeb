import { useEffect, useState } from 'react';
import { useNotification } from '@/context/NotificationContext';

interface ServiceWorkerState {
  registration: ServiceWorkerRegistration | null;
  error: Error | null;
  isSupported: boolean;
  notificationPermission: NotificationPermission;
}

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    registration: null,
    error: null,
    isSupported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
    notificationPermission: typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission 
      : 'denied'
  });
  const { addNotification } = useNotification();

  // Handle service worker registration
  useEffect(() => {
    if (!state.isSupported) {
      console.log('Service Workers are not supported');
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        setState(prev => ({ ...prev, registration }));
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setState(prev => ({ ...prev, error: error as Error }));
      }
    };

    registerServiceWorker();
  }, [state.isSupported]);

  // Handle notification permission separately
  useEffect(() => {
    if (!('Notification' in window)) return;

    const updatePermissionState = () => {
      setState(prev => ({ ...prev, notificationPermission: Notification.permission }));
    };

    // Update initial state
    updatePermissionState();

    // Listen for permission changes
    if (typeof window !== 'undefined' && 'permissions' in navigator) {
      // @ts-ignore - Notification permission change API
      navigator.permissions.query({ name: 'notifications' }).then(permissionStatus => {
        permissionStatus.onchange = () => {
          updatePermissionState();
        };
      });
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      addNotification({
        message: 'הדפדפן שלך לא תומך בהתראות',
        type: 'error',
        duration: 5000
      });
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, notificationPermission: permission }));
      
      if (permission === 'granted') {
        addNotification({
          message: 'התראות טיימר הופעלו בהצלחה',
          type: 'success',
          duration: 3000
        });
      } else if (permission === 'denied') {
        addNotification({
          message: 'לא ניתן להפעיל התראות טיימר ללא אישור',
          type: 'warning',
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      addNotification({
        message: 'שגיאה בהפעלת התראות',
        type: 'error',
        duration: 5000
      });
    }
  };

  const sendNotification = async (description: string) => {
    if (!state.registration || state.notificationPermission !== 'granted') return;

    try {
      await state.registration.active?.postMessage({
        type: 'TIMER_END',
        description
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  };

  return {
    ...state,
    sendNotification,
    requestNotificationPermission
  };
} 
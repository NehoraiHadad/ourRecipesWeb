import { useEffect, useState } from 'react';
import { useNotification } from '@/context/NotificationContext';

interface ServiceWorkerState {
  registration: ServiceWorkerRegistration | null;
  error: Error | null;
  isSupported: boolean;
}

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    registration: null,
    error: null,
    isSupported: typeof window !== 'undefined' && 'serviceWorker' in navigator
  });
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!state.isSupported) {
      console.log('Service Workers are not supported');
      return;
    }

    const registerServiceWorker = async () => {
      try {
        // Register Service Worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        setState(prev => ({ ...prev, registration }));

        // Request notification permission
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            addNotification({
              message: 'התראות טיימר הופעלו בהצלחה',
              type: 'success',
              duration: 3000
            });
          }
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setState(prev => ({ ...prev, error: error as Error }));
      }
    };

    registerServiceWorker();
  }, [addNotification]);

  const sendNotification = async (description: string) => {
    if (!state.registration) return;

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
    sendNotification
  };
} 
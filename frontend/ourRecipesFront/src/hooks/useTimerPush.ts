'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pushRequest, TimerPushClientError } from '@/lib/timers/webPushClient';

const STORAGE_KEY = 'recipe-timer-push-enabled';
export type TimerPushStatus = 'loading' | 'unsupported' | 'install-required' | 'unavailable' | 'off' | 'ready' | 'error';
interface PushConfig { enabled: boolean; publicKey: string | null }
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, letter => letter.charCodeAt(0));
}
function support(): TimerPushStatus | null {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (ios && !standalone) return 'install-required';
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return null;
}

export function useTimerPush() {
  const [status, setStatus] = useState<TimerPushStatus>('loading');
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const configRef = useRef<PushConfig | null>(null);
  const subscriptionRef = useRef<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const record = useCallback((id: string | null) => {
    subscriptionRef.current = id;
    if (mounted.current) setSubscriptionId(id);
  }, []);
  const register = useCallback(async (config: PushConfig) => {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    const key = keyBytes(config.publicKey!);
    if (subscription?.options.applicationServerKey &&
      new Uint8Array(subscription.options.applicationServerKey).toString() !== key.toString()) {
      await subscription.unsubscribe(); subscription = null;
    }
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    let result: { id: string };
    try {
      result = await pushRequest('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
    } catch (error) {
      if (!(error instanceof TimerPushClientError) || error.status !== 409) throw error;
      // A new guest/login session must not take over another session's endpoint.
      await subscription.unsubscribe();
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      result = await pushRequest('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
    }
    localStorage.setItem(STORAGE_KEY, 'true');
    record(result.id);
    if (mounted.current) { setStatus('ready'); setErrorStatus(null); }
  }, [record]);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const unsupported = support();
    if (unsupported) { if (mounted.current) setStatus(unsupported); return; }
    busy.current = true;
    try {
      const config = await pushRequest<PushConfig>('/api/push/config');
      configRef.current = config;
      if (!config.enabled || !config.publicKey) { if (mounted.current) setStatus('unavailable'); return; }
      if (localStorage.getItem(STORAGE_KEY) === 'true' && Notification.permission === 'granted') {
        // Auto-restore may renew an existing subscription, but never requests permission.
        await register(config);
      } else {
        record(null);
        if (mounted.current) setStatus('off');
      }
    } catch (error) {
      if (mounted.current) { setStatus('error'); setErrorStatus(error instanceof TimerPushClientError ? error.status : null); }
    } finally { busy.current = false; }
  }, [record, register]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onResume = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      mounted.current = false;
      window.removeEventListener('online', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [refresh]);

  const enable = useCallback(async () => {
    const unsupported = support();
    if (unsupported) { setStatus(unsupported); return false; }
    const config = configRef.current;
    if (!config?.enabled || !config.publicKey) { setStatus('unavailable'); return false; }
    if (busy.current) return false;
    busy.current = true;
    try {
      // Preserve the user's click as the permission gesture; don't fetch first.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus('off'); return false; }
      await register(config);
      return true;
    } catch (error) {
      setStatus('error'); setErrorStatus(error instanceof TimerPushClientError ? error.status : null);
      return false;
    } finally { busy.current = false; }
  }, [register]);

  const disable = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const id = subscriptionRef.current;
    if (id) {
      try { await pushRequest(`/api/push/subscriptions/${id}`, { method: 'DELETE' }); } catch { /* Unsubscribe at the browser even while offline. */ }
    }
    if (subscription && !(await subscription.unsubscribe())) throw new Error('Could not unsubscribe');
    localStorage.removeItem(STORAGE_KEY);
    record(null); setStatus('off');
  }, [record]);

  return { status, subscriptionId, errorStatus, enable, disable };
}

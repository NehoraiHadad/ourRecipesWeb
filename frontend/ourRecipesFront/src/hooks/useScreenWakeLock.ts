'use client';

import { useEffect, useState } from 'react';

/** The OS releases screen locks when hidden. Reacquire only while enabled and visible. */
export function useScreenWakeLock(enabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSupported('wakeLock' in navigator);
    if (!enabled || !('wakeLock' in navigator)) return;
    let disposed = false;
    let pending = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (disposed || pending || (lock && !lock.released) || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (disposed) { await acquired.release(); return; }
        lock = acquired;
        setActive(true);
        setFailed(false);
        acquired.addEventListener('release', () => { if (!disposed) setActive(false); });
      } catch {
        if (!disposed) { setActive(false); setFailed(true); }
      } finally {
        pending = false;
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
      setActive(false);
    };
  }, [enabled]);

  return { supported, active, failed };
}

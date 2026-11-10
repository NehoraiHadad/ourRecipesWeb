import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';

function sentinel() {
  const events = new EventTarget();
  return {
    released: false,
    addEventListener: events.addEventListener.bind(events),
    release: vi.fn(async function (this: { released: boolean }) {
      this.released = true;
      events.dispatchEvent(new Event('release'));
    }),
  };
}
beforeEach(() => {
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: () => undefined });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('screen wake lock', () => {
  it('requests only when enabled and releases on disable', async () => {
    const lock = sentinel();
    const request = vi.fn().mockResolvedValue(lock);
    vi.spyOn(navigator, 'wakeLock', 'get').mockReturnValue({ request } as unknown as WakeLock);
    const { result, rerender } = renderHook(({ enabled }) => useScreenWakeLock(enabled), { initialProps: { enabled: false } });
    expect(request).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.active).toBe(true));
    rerender({ enabled: false });
    expect(lock.release).toHaveBeenCalledOnce();
    expect(result.current.active).toBe(false);
  });

  it('releases a lock whose request finishes after unmount', async () => {
    let resolve!: (value: ReturnType<typeof sentinel>) => void;
    const request = vi.fn(() => new Promise<ReturnType<typeof sentinel>>(done => { resolve = done; }));
    vi.spyOn(navigator, 'wakeLock', 'get').mockReturnValue({ request } as unknown as WakeLock);
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    unmount();
    const lock = sentinel();
    await act(async () => resolve(lock));
    expect(lock.release).toHaveBeenCalledOnce();
  });
});

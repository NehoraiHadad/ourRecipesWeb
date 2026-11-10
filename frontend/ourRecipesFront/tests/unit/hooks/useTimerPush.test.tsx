import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimerPush } from '@/hooks/useTimerPush';
const publicKey = Buffer.alloc(65, 1).toString('base64url');
const subscribe = vi.fn(); const unsubscribe = vi.fn(); const requestPermission = vi.fn();
let subscription: any;
let granted: string;
let fake: any;
const configResponse = () => new Response(JSON.stringify({ enabled: true, publicKey }), { status: 200 });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); granted = 'default'; subscription = null;
  fake = { options: {}, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }), unsubscribe };
  unsubscribe.mockImplementation(async () => { subscription = null; return true; });
  subscribe.mockImplementation(async () => { subscription = fake; return fake; });
  requestPermission.mockImplementation(async () => { granted = 'granted'; return granted; });
  vi.stubGlobal('isSecureContext', true); vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { get permission() { return granted; }, requestPermission });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription, subscribe } })
  } });
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (url === '/api/push/config') return configResponse();
    return options?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ id: 'server-subscription' }), { status: 200 });
  });
});
afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'serviceWorker'); vi.restoreAllMocks(); });
describe('PWA notification opt-in', () => {
  it('does not request permission until the user enables notifications', async () => {
    const { result } = renderHook(useTimerPush);
    await waitFor(() => expect(result.current.status).toBe('off'));
    expect(requestPermission).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.enable()).toBe(true); });
    expect(result.current.subscriptionId).toBe('server-subscription');
    expect(result.current.status).toBe('ready'); expect(requestPermission).toHaveBeenCalledOnce();
  });
  it('restores an opted-in browser without reopening the permission dialog', async () => {
    localStorage.setItem('recipe-timer-push-enabled', 'true'); granted = 'granted'; subscription = fake;
    const { result } = renderHook(useTimerPush);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(requestPermission).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled();
  });
  it('unsubscribes the browser even when the server cannot be reached', async () => {
    const { result } = renderHook(useTimerPush);
    await waitFor(() => expect(result.current.status).toBe('off'));
    await act(async () => { await result.current.enable(); });
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.disable(); });
    expect(unsubscribe).toHaveBeenCalledOnce(); expect(result.current.status).toBe('off');
    expect(localStorage.getItem('recipe-timer-push-enabled')).toBeNull();
  });
  it('reports login expiration without claiming that registration succeeded', async () => {
    const { result } = renderHook(useTimerPush);
    await waitFor(() => expect(result.current.status).toBe('off'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await act(async () => { expect(await result.current.enable()).toBe(false); });
    expect(result.current.status).toBe('error'); expect(result.current.errorStatus).toBe(401);
    expect(localStorage.getItem('recipe-timer-push-enabled')).toBeNull();
  });
  it('explains the Home Screen requirement on iPhone before asking for permission', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const { result } = renderHook(useTimerPush);
    await waitFor(() => expect(result.current.status).toBe('install-required'));
    expect(requestPermission).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps disabled server configuration from producing a misleading opt-in', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false, publicKey: null })));
    const { result } = renderHook(useTimerPush);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    await act(async () => { expect(await result.current.enable()).toBe(false); });
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

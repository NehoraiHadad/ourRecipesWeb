export type TimerPushState = 'scheduled' | 'pending' | 'paused' | 'cancelled' | 'expired' | 'error';
export interface PushTimerSnapshot {
  id: string;
  alarmVersion?: number;
  isPaused?: boolean;
  pendingDelete?: boolean;
  endsAt?: number | null;
  recipeName: string;
  description: string;
  recipeUrl?: string;
}
export class TimerPushClientError extends Error {
  constructor(public status: number) { super('Timer notification request failed'); }
}
export async function pushRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { ...options, signal: options?.signal ?? controller.signal,
      credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options?.headers } });
    if (!response.ok) throw new TimerPushClientError(response.status);
    return response.status === 204 ? undefined as T : response.json();
  } finally { clearTimeout(timeout); }
}
export async function synchronizeTimerPush(timer: PushTimerSnapshot, subscriptionId: string, muted: boolean) {
  const response = await pushRequest<{ state: string; version: number }>(`/api/push/timers/${encodeURIComponent(timer.id)}`, {
    method: 'PUT', body: JSON.stringify({ subscriptionId, version: timer.alarmVersion ?? 1,
      state: timer.pendingDelete ? 'cancelled' : timer.isPaused ? 'paused' : 'running',
      endsAt: timer.isPaused || timer.pendingDelete ? null : timer.endsAt ?? null,
      recipeName: timer.recipeName.slice(0, 160) || 'מתכון', description: timer.description.slice(0, 500) || 'טיימר',
      recipeUrl: timer.recipeUrl ?? '/', muted })
  });
  const state: TimerPushState = response.state === 'scheduled' ? 'scheduled'
    : response.state === 'pending' ? 'pending' : response.state === 'paused' ? 'paused'
    : response.state === 'cancelled' ? 'cancelled' : ['sent', 'expired'].includes(response.state) ? 'expired' : 'error';
  return { state, version: response.version };
}

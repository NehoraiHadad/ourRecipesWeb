/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { withRetry } from '@/lib/ai/gemini/retry';

function apiError(status: number, message = 'upstream error'): Error {
  return Object.assign(new Error(message), { status });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('withRetry', () => {
  it('retries a 429 and resolves once the call succeeds', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { retries: 1, baseDelayMs: 10, timeoutMs: 100_000 });
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 with exponential backoff before giving up', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(apiError(503));

    const promise = withRetry(fn, { retries: 2, baseDelayMs: 10, timeoutMs: 100_000 });
    // Swallow the eventual rejection so it isn't reported as unhandled while
    // timers are advanced below.
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toMatchObject({ status: 503 });
    // First attempt + 2 retries = 3 calls.
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-transient error like 400', async () => {
    const err = apiError(400, 'bad request');
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { retries: 2 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts and rejects a call that exceeds the per-attempt timeout', async () => {
    vi.useFakeTimers();
    const fn = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('caller aborted'), { name: 'AbortError' }))
          );
        })
    );

    const promise = withRetry(fn, { retries: 0, timeoutMs: 1000 });
    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('propagates the last error once retries are exhausted', async () => {
    vi.useFakeTimers();
    const err = apiError(500);
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withRetry(fn, { retries: 1, baseDelayMs: 5, timeoutMs: 100_000 });
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

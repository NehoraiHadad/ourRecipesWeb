/**
 * Retry + per-attempt timeout wrapper for Gemini calls.
 *
 * Retries only transient failures — HTTP 429/500/502/503 (the SDK's
 * `ApiError` carries `status`) or an aborted/network call — with exponential
 * backoff and jitter. Anything else (bad request, auth, etc.) propagates on
 * the first attempt.
 */
import { logger } from '@/lib/logger';

export interface RetryOptions {
  /** Extra attempts after the first. Default 2 (3 attempts total). */
  retries?: number;
  /** Per-attempt timeout in ms. Default 45s. */
  timeoutMs?: number;
  /** Base delay for the first backoff step, in ms. Default 500ms. */
  baseDelayMs?: number;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_BASE_DELAY_MS = 500;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503]);

class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini call timed out after ${timeoutMs}ms`);
    this.name = 'AbortError';
  }
}

function isTransient(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && TRANSIENT_STATUSES.has(status)) return true;
  // Node/undici network failures surface as a bare fetch TypeError.
  return error instanceof TypeError && /fetch/i.test(error.message);
}

function jitteredDelay(attempt: number, baseDelayMs: number): number {
  const window = baseDelayMs * 2 ** attempt;
  return window / 2 + Math.random() * (window / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const timeout = new Promise<T>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new TimeoutError(timeoutMs)));
  });

  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  for (let attempt = 0; ; attempt++) {
    try {
      return await callWithTimeout(fn, timeoutMs);
    } catch (error) {
      if (attempt >= retries || !isTransient(error)) throw error;
      const delay = jitteredDelay(attempt, baseDelayMs);
      logger.warn({ attempt, delay, error }, 'Gemini call failed, retrying');
      await sleep(delay);
    }
  }
}

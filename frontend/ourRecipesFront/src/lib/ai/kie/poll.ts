/**
 * Polls a KIE task to completion. Used by "almost-synchronous" flows (image
 * generation inside a route handler) — see
 * `docs/architecture/KIE_INTEGRATION_RESEARCH.md` §5.3, level A.
 *
 * Backoff starts gentle (2s) and grows to a 5s cap, keeping us well under
 * KIE's 20 requests / 10s account-wide rate limit even for a slow task.
 */
import { logger } from '@/lib/logger';
import { getTask } from './client';
import type { KieResultPayload } from './types';

const log = logger.child({ context: 'ai/kie/poll' });

const DEFAULT_TIMEOUT_MS = 110_000;
const DEFAULT_INITIAL_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5_000;
const BACKOFF_STEP_MS = 1_500;

export interface PollTaskOptions {
  timeoutMs?: number;
  initialDelayMs?: number;
}

/** Thrown when a KIE task reaches `state: 'fail'`. */
export class KieTaskFailedError extends Error {
  readonly taskId: string;
  readonly failCode?: string;

  constructor(taskId: string, failCode: string | undefined, failMsg: string | undefined) {
    super(`KIE task ${taskId} failed${failCode ? ` (${failCode})` : ''}: ${failMsg ?? 'no message'}`);
    this.name = 'KieTaskFailedError';
    this.taskId = taskId;
    this.failCode = failCode;
  }
}

/** Thrown when a KIE task does not reach a terminal state before `timeoutMs`. */
export class KieTaskTimeoutError extends Error {
  readonly taskId: string;

  constructor(taskId: string, timeoutMs: number) {
    super(`KIE task ${taskId} did not finish within ${timeoutMs}ms`);
    this.name = 'KieTaskTimeoutError';
    this.taskId = taskId;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseResultUrls(taskId: string, resultJson: string | undefined): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as KieResultPayload;
    return Array.isArray(parsed.resultUrls) ? parsed.resultUrls : [];
  } catch (error) {
    log.warn({ taskId, err: error }, 'Failed to parse KIE resultJson');
    return [];
  }
}

/**
 * Polls `getTask` until the task succeeds, fails, or `timeoutMs` elapses.
 *
 * @returns The `resultUrls` from `resultJson` on success.
 */
export async function pollTaskResult(
  taskId: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, initialDelayMs = DEFAULT_INITIAL_DELAY_MS }: PollTaskOptions = {}
): Promise<string[]> {
  const start = Date.now();
  let delay = initialDelayMs;

  await sleep(initialDelayMs);

  for (;;) {
    const task = await getTask(taskId);

    if (task.state === 'success') {
      const urls = parseResultUrls(taskId, task.resultJson);
      log.info({ taskId, count: urls.length }, 'KIE task succeeded');
      return urls;
    }

    if (task.state === 'fail') {
      throw new KieTaskFailedError(taskId, task.failCode, task.failMsg);
    }

    if (Date.now() - start >= timeoutMs) {
      throw new KieTaskTimeoutError(taskId, timeoutMs);
    }

    await sleep(delay);
    delay = Math.min(delay + BACKOFF_STEP_MS, MAX_DELAY_MS);
  }
}

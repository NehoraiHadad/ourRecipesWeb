/**
 * Thin fetch client for the KIE.ai Jobs API. Knows nothing about recipes or
 * prompts — that logic lives in the caller (route/service), per
 * `docs/architecture/KIE_INTEGRATION_RESEARCH.md` §5.1.
 */
import { logger } from '@/lib/logger';
import type {
  CreateTaskData,
  CreateTaskResponse,
  RecordInfoData,
  RecordInfoResponse
} from './types';

const API_ROOT = 'https://api.kie.ai/api/v1';
/** Per-HTTP-call timeout. KIE tasks are async; this only bounds the request itself. */
const HTTP_TIMEOUT_MS = 30_000;

const log = logger.child({ context: 'ai/kie/client' });

/** Uniform error for every KIE Jobs API failure: non-200 `code`, HTTP errors, network errors. */
export class KieApiError extends Error {
  readonly code: number;
  readonly taskId?: string;

  constructor(options: { method: string; code: number; description: string; taskId?: string; cause?: unknown }) {
    super(`KIE ${options.method} failed (${options.code}): ${options.description}`);
    this.name = 'KieApiError';
    this.code = options.code;
    this.taskId = options.taskId;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Reads the API key at call time (never at module load) so tests/cold starts can set it first. */
function getApiKey(method: string): string {
  const key = process.env.KIE_API_KEY;
  if (!key) {
    throw new KieApiError({ method, code: 0, description: 'KIE_API_KEY is not configured' });
  }
  return key;
}

async function call<T>(method: string, path: string, init: RequestInit): Promise<T> {
  const key = getApiKey(method);
  const url = `${API_ROOT}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });
  } catch (error) {
    throw new KieApiError({
      method,
      code: 0,
      description: error instanceof Error ? error.message : 'Network request failed',
      cause: error
    });
  }

  let body: KieEnvelopeLike<T> | null = null;
  try {
    body = (await response.json()) as KieEnvelopeLike<T>;
  } catch {
    body = null;
  }

  if (!response.ok || !body || body.code !== 200) {
    const description = body?.message ?? body?.msg ?? `HTTP ${response.status}`;
    const error = new KieApiError({ method, code: body?.code ?? response.status, description });
    log.warn({ method, code: error.code, description }, 'KIE Jobs API call failed');
    throw error;
  }

  return body.data;
}

type KieEnvelopeLike<T> = { code: number; message?: string; msg?: string; data: T };

/** `POST /jobs/createTask` — creates the task, does not wait for it to finish. */
export async function createTask(model: string, input: Record<string, unknown>): Promise<CreateTaskData> {
  return call<CreateTaskResponse['data']>('createTask', '/jobs/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input })
  });
}

/** `GET /jobs/recordInfo?taskId=...` — current state of a previously created task. */
export async function getTask(taskId: string): Promise<RecordInfoData> {
  try {
    return await call<RecordInfoResponse['data']>(
      'recordInfo',
      `/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { method: 'GET' }
    );
  } catch (error) {
    if (error instanceof KieApiError && error.taskId === undefined) {
      (error as { taskId?: string }).taskId = taskId;
    }
    throw error;
  }
}

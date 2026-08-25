/**
 * Types for the KIE.ai async Jobs API ("Market").
 *
 * Every generation is a two-step task: `createTask` returns a `taskId`
 * immediately (task *created*, not done), then `recordInfo` is polled until
 * the task reaches a terminal state.
 *
 * @see docs/architecture/KIE_INTEGRATION_RESEARCH.md §2
 */

/** Lifecycle of a KIE task, as reported by `recordInfo`. */
export type KieTaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';

/** Body of `POST /api/v1/jobs/createTask`. */
export interface CreateTaskRequest {
  model: string;
  input: Record<string, unknown>;
  /** Optional webhook; Wave 1A only uses polling, so this stays unset. */
  callBackUrl?: string;
}

/**
 * Envelope shared by every KIE endpoint. Error responses have been observed
 * using both `message` and `msg` for the human-readable reason, so both are
 * accepted.
 */
export interface KieEnvelope<T> {
  code: number;
  message?: string;
  msg?: string;
  data: T;
}

/** `data` of a successful `createTask` response — the task now exists, nothing more. */
export interface CreateTaskData {
  taskId: string;
}

export type CreateTaskResponse = KieEnvelope<CreateTaskData>;

/** `data` of `recordInfo`. `resultJson` is only populated once `state` is `'success'`. */
export interface RecordInfoData {
  taskId: string;
  model: string;
  state: KieTaskState;
  /** JSON string: `{ "resultUrls": string[] }`. Present only when `state === 'success'`. */
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
}

export type RecordInfoResponse = KieEnvelope<RecordInfoData>;

/** Parsed shape of `RecordInfoData.resultJson`. */
export interface KieResultPayload {
  resultUrls: string[];
}

/**
 * Telegram Bot API client — native `fetch` only, no bot libraries.
 *
 * Every call goes to `https://api.telegram.org/bot<TOKEN>/<method>` and returns
 * the `result` field of a successful response; anything else throws
 * {@link TelegramApiError}.
 *
 * The bot token is read from `process.env.TELEGRAM_BOT_TOKEN` **lazily, at call
 * time** — never at module load — so that tests and serverless cold starts can
 * populate the environment first.
 *
 * @see https://core.telegram.org/bots/api
 */
import { logger } from '@/lib/logger';
import type {
  DeleteMessageParams,
  EditMessageCaptionParams,
  EditMessageMediaParams,
  EditMessageTextParams,
  SendMessageParams,
  SendPhotoParams,
  TelegramApiResponse,
  TelegramChatId,
  TelegramChatMember,
  TelegramFile,
  TelegramMessage
} from './types';

const API_ROOT = 'https://api.telegram.org';

const log = logger.child({ context: 'telegram/botApi' });

/**
 * Uniform error for every Bot API failure: `ok: false` responses, non-2xx HTTP
 * statuses, network errors and missing configuration.
 */
export class TelegramApiError extends Error {
  readonly error_code: number;
  readonly description: string;
  readonly method: string;
  readonly httpStatus?: number;
  /** `retry_after` / `migrate_to_chat_id` hints, when Telegram sends them. */
  readonly parameters?: TelegramApiResponse<unknown>['parameters'];

  constructor(options: {
    method: string;
    error_code: number;
    description: string;
    httpStatus?: number;
    parameters?: TelegramApiResponse<unknown>['parameters'];
    cause?: unknown;
  }) {
    super(`Telegram ${options.method} failed (${options.error_code}): ${options.description}`);
    this.name = 'TelegramApiError';
    this.error_code = options.error_code;
    this.description = options.description;
    this.method = options.method;
    this.httpStatus = options.httpStatus;
    this.parameters = options.parameters;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Reads the bot token at call time. Throws if it is not configured. */
function getBotToken(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new TelegramApiError({
      method,
      error_code: 0,
      description: 'TELEGRAM_BOT_TOKEN is not configured'
    });
  }
  return token;
}

/** Drops `undefined` entries so they are not serialized as `null`. */
function compact<T extends Record<string, unknown>>(params: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function isBinary(value: unknown): value is Buffer | Blob {
  return (
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
  );
}

/**
 * Low-level call. Exported so future methods (`setWebhook`, `getMe`, …) can be
 * issued without extending this module.
 *
 * @param method Bot API method name, e.g. `sendMessage`.
 * @param params JSON body. Pass a `FormData` instead for binary uploads.
 */
export async function callTelegramApi<T>(
  method: string,
  params: Record<string, unknown> | FormData = {}
): Promise<T> {
  const token = getBotToken(method);
  const url = `${API_ROOT}/bot${token}/${method}`;

  const isForm = typeof FormData !== 'undefined' && params instanceof FormData;
  const init: RequestInit = isForm
    ? { method: 'POST', body: params as FormData }
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compact(params as Record<string, unknown>))
      };

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new TelegramApiError({
      method,
      error_code: 0,
      description: error instanceof Error ? error.message : 'Network request failed',
      cause: error
    });
  }

  let body: TelegramApiResponse<T> | null = null;
  try {
    body = (await response.json()) as TelegramApiResponse<T>;
  } catch {
    body = null;
  }

  if (!response.ok || !body || body.ok !== true) {
    const error = new TelegramApiError({
      method,
      error_code: body?.error_code ?? response.status,
      description: body?.description ?? `HTTP ${response.status}`,
      httpStatus: response.status,
      parameters: body?.parameters
    });
    log.warn(
      { method, error_code: error.error_code, description: error.description },
      'Telegram API call failed'
    );
    throw error;
  }

  return body.result as T;
}

/** `sendMessage` — supports `parse_mode: 'HTML'` for formatted recipe posts. */
export async function sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
  return callTelegramApi<TelegramMessage>('sendMessage', { ...params });
}

/**
 * `sendPhoto` — `photo` may be a `file_id`, a public URL, or binary
 * (`Buffer`/`Blob`), in which case the request is sent as multipart form-data.
 */
export async function sendPhoto(params: SendPhotoParams): Promise<TelegramMessage> {
  const { photo, filename, ...rest } = params;

  if (!isBinary(photo)) {
    return callTelegramApi<TelegramMessage>('sendPhoto', { ...rest, photo });
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(compact(rest as Record<string, unknown>))) {
    form.append(key, String(value));
  }
  const blob = Buffer.isBuffer(photo)
    ? new Blob([new Uint8Array(photo)], { type: 'image/jpeg' })
    : photo;
  form.append('photo', blob, filename ?? 'photo.jpg');

  return callTelegramApi<TelegramMessage>('sendPhoto', form);
}

/**
 * `editMessageText`. We always edit by `chat_id` + `message_id`, so Telegram
 * returns the edited Message (the `true` variant is inline-only).
 */
export async function editMessageText(params: EditMessageTextParams): Promise<TelegramMessage> {
  return callTelegramApi<TelegramMessage>('editMessageText', { ...params });
}

/** `editMessageCaption` — used when the channel message carries a photo. */
export async function editMessageCaption(
  params: EditMessageCaptionParams
): Promise<TelegramMessage> {
  return callTelegramApi<TelegramMessage>('editMessageCaption', { ...params });
}

/** `editMessageMedia` — replaces the photo of an existing message. */
export async function editMessageMedia(params: EditMessageMediaParams): Promise<TelegramMessage> {
  const { media, ...rest } = params;
  return callTelegramApi<TelegramMessage>('editMessageMedia', {
    ...rest,
    media: JSON.stringify(compact(media as unknown as Record<string, unknown>))
  });
}

/** `deleteMessage` — resolves to `true`, throws when the message is gone. */
export async function deleteMessage(params: DeleteMessageParams): Promise<true> {
  return callTelegramApi<true>('deleteMessage', { ...params });
}

/** `getFile` — resolves the temporary `file_path` used by {@link downloadFile}. */
export async function getFile(fileId: string): Promise<TelegramFile> {
  return callTelegramApi<TelegramFile>('getFile', { file_id: fileId });
}

/**
 * Downloads a file previously resolved with {@link getFile}.
 * Files are served from `https://api.telegram.org/file/bot<TOKEN>/<file_path>`
 * (max 20MB for the Bot API).
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const token = getBotToken('downloadFile');
  const url = `${API_ROOT}/file/bot${token}/${filePath}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new TelegramApiError({
      method: 'downloadFile',
      error_code: 0,
      description: error instanceof Error ? error.message : 'Network request failed',
      cause: error
    });
  }

  if (!response.ok) {
    throw new TelegramApiError({
      method: 'downloadFile',
      error_code: response.status,
      description: `HTTP ${response.status}`,
      httpStatus: response.status
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * `getChatMember` — the basis of the edit-permission check
 * (see `src/lib/auth/permissions.ts`).
 */
export async function getChatMember(
  chatId: TelegramChatId,
  userId: number | string
): Promise<TelegramChatMember> {
  return callTelegramApi<TelegramChatMember>('getChatMember', {
    chat_id: chatId,
    user_id: userId
  });
}

export type * from './types';

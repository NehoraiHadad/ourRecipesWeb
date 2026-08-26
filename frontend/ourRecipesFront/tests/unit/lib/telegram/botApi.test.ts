/**
 * @vitest-environment node
 *
 * Bot API client — every call is mocked, nothing touches the network.
 *
 * The outgoing-mirror methods (`sendMessage`, `sendPhoto`, `editMessage*`,
 * `deleteMessage`) were removed along with the mirror they backed (Wave
 * 5.4b) — the main Telegram channel this project used to publish to is gone.
 * What remains is what the app still genuinely calls: `getFile`/`downloadFile`
 * (recipe photo intake) and `getChatMember` (the edit-permission check).
 * `callTelegramApi` itself is exercised directly since it is what every
 * future method — and today, `getFile`/`getChatMember` — is built on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TelegramApiError,
  callTelegramApi,
  downloadFile,
  getChatMember,
  getFile
} from '@/lib/telegram/botApi';

const TOKEN = '123456:TEST-TOKEN';
const BASE = `https://api.telegram.org/bot${TOKEN}`;

let fetchMock: ReturnType<typeof vi.fn>;

/** Builds a fetch response body. */
function okResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result })
  } as unknown as Response;
}

/** Last fetch call, as [url, init]. */
function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return [call[0] as string, (call[1] ?? {}) as RequestInit];
}

function lastJsonBody(): Record<string, unknown> {
  const [, init] = lastCall();
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe('botApi — request shape', () => {
  it('callTelegramApi posts JSON to the right URL and returns result', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true }));

    const result = await callTelegramApi<{ ok: boolean }>('setWebhook', { url: 'https://x/y' });

    expect(result).toEqual({ ok: true });
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/setWebhook`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(lastJsonBody()).toEqual({ url: 'https://x/y' });
  });

  it('omits undefined params from the body', async () => {
    fetchMock.mockResolvedValue(okResponse(true));

    await callTelegramApi('someMethod', { a: 1, b: undefined });

    expect(lastJsonBody()).toEqual({ a: 1 });
  });

  it('getFile returns the file descriptor', async () => {
    const file = { file_id: 'F1', file_unique_id: 'U1', file_path: 'photos/file_1.jpg' };
    fetchMock.mockResolvedValue(okResponse(file));

    await expect(getFile('F1')).resolves.toEqual(file);
    expect(lastCall()[0]).toBe(`${BASE}/getFile`);
    expect(lastJsonBody()).toEqual({ file_id: 'F1' });
  });

  it('getChatMember posts chat_id + user_id', async () => {
    const member = { status: 'administrator', user: { id: 7 }, can_edit_messages: true };
    fetchMock.mockResolvedValue(okResponse(member));

    await expect(getChatMember(-1001, '7')).resolves.toEqual(member);
    expect(lastCall()[0]).toBe(`${BASE}/getChatMember`);
    expect(lastJsonBody()).toEqual({ chat_id: -1001, user_id: '7' });
  });

  it('callTelegramApi can issue arbitrary methods', async () => {
    fetchMock.mockResolvedValue(okResponse(true));

    await expect(callTelegramApi<boolean>('setWebhook', { url: 'https://x/y' })).resolves.toBe(true);
    expect(lastCall()[0]).toBe(`${BASE}/setWebhook`);
  });
});

describe('botApi — downloadFile', () => {
  it('downloads from the file endpoint and returns a Buffer', async () => {
    const bytes = new TextEncoder().encode('image-bytes');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer
    } as unknown as Response);

    const buffer = await downloadFile('photos/file_1.jpg');

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('image-bytes');
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.telegram.org/file/bot${TOKEN}/photos/file_1.jpg`
    );
  });

  it('throws TelegramApiError on a non-2xx download', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);

    await expect(downloadFile('photos/missing.jpg')).rejects.toBeInstanceOf(TelegramApiError);
  });
});

describe('botApi — error handling', () => {
  it('throws TelegramApiError carrying error_code and description on ok:false', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: chat not found' })
    } as unknown as Response);

    const error = await callTelegramApi('sendMessage', { chat_id: -1, text: 'x' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TelegramApiError);
    expect((error as TelegramApiError).name).toBe('TelegramApiError');
    expect((error as TelegramApiError).error_code).toBe(400);
    expect((error as TelegramApiError).description).toBe('Bad Request: chat not found');
    expect((error as TelegramApiError).method).toBe('sendMessage');
    expect((error as TelegramApiError).message).toContain('chat not found');
  });

  it('throws TelegramApiError on a non-2xx HTTP status without a body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      }
    } as unknown as Response);

    const error = await callTelegramApi('deleteMessage', { chat_id: -1001, message_id: 1 }).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(TelegramApiError);
    expect((error as TelegramApiError).error_code).toBe(502);
    expect((error as TelegramApiError).httpStatus).toBe(502);
  });

  it('wraps network failures', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const error = await getFile('F1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TelegramApiError);
    expect((error as TelegramApiError).error_code).toBe(0);
    expect((error as TelegramApiError).description).toBe('ECONNRESET');
  });

  it('throws when TELEGRAM_BOT_TOKEN is missing (read lazily at call time)', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    const error = await getFile('F1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TelegramApiError);
    expect((error as TelegramApiError).description).toContain('TELEGRAM_BOT_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes retry_after parameters from rate limits', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests',
        parameters: { retry_after: 12 }
      })
    } as unknown as Response);

    const error = await getChatMember(-1001, '7').catch((e: unknown) => e);

    expect((error as TelegramApiError).parameters).toEqual({ retry_after: 12 });
  });
});

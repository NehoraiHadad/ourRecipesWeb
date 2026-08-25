/**
 * @vitest-environment node
 *
 * Bot API client — every call is mocked, nothing touches the network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TelegramApiError,
  callTelegramApi,
  deleteMessage,
  downloadFile,
  editMessageCaption,
  editMessageMedia,
  editMessageText,
  getChatMember,
  getFile,
  sendMessage,
  sendPhoto
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

function apiErrorResponse(error_code: number, description: string, status = 400) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ ok: false, error_code, description })
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

const message = { message_id: 42, chat: { id: -1001, type: 'channel' }, date: 1, text: 'hi' };

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
  it('sendMessage posts JSON to the right URL and returns result', async () => {
    fetchMock.mockResolvedValue(okResponse(message));

    const result = await sendMessage({
      chat_id: -1001,
      text: '<b>מתכון</b>',
      parse_mode: 'HTML'
    });

    expect(result).toEqual(message);
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/sendMessage`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(lastJsonBody()).toEqual({
      chat_id: -1001,
      text: '<b>מתכון</b>',
      parse_mode: 'HTML'
    });
  });

  it('omits undefined params from the body', async () => {
    fetchMock.mockResolvedValue(okResponse(message));

    await sendMessage({ chat_id: -1001, text: 'x', parse_mode: undefined });

    expect(lastJsonBody()).toEqual({ chat_id: -1001, text: 'x' });
  });

  it('sendPhoto with a file_id/URL posts JSON', async () => {
    fetchMock.mockResolvedValue(okResponse(message));

    const result = await sendPhoto({
      chat_id: -1001,
      photo: 'https://example.com/a.jpg',
      caption: 'כותרת',
      parse_mode: 'HTML'
    });

    expect(result).toEqual(message);
    const [url] = lastCall();
    expect(url).toBe(`${BASE}/sendPhoto`);
    expect(lastJsonBody()).toEqual({
      chat_id: -1001,
      photo: 'https://example.com/a.jpg',
      caption: 'כותרת',
      parse_mode: 'HTML'
    });
  });

  it('sendPhoto with a Buffer posts multipart form-data', async () => {
    fetchMock.mockResolvedValue(okResponse(message));

    await sendPhoto({
      chat_id: -1001,
      photo: Buffer.from('binary-image'),
      caption: 'cap',
      filename: 'recipe.jpg'
    });

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/sendPhoto`);
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get('chat_id')).toBe('-1001');
    expect(form.get('caption')).toBe('cap');
    expect(form.get('filename')).toBeNull(); // internal-only option
    const photo = form.get('photo');
    expect(photo).toBeInstanceOf(Blob);
    expect(await (photo as Blob).text()).toBe('binary-image');
  });

  it('editMessageText posts chat_id/message_id/text', async () => {
    fetchMock.mockResolvedValue(okResponse(message));

    const result = await editMessageText({
      chat_id: -1001,
      message_id: 42,
      text: 'updated',
      parse_mode: 'HTML'
    });

    expect(result).toEqual(message);
    expect(lastCall()[0]).toBe(`${BASE}/editMessageText`);
    expect(lastJsonBody()).toEqual({
      chat_id: -1001,
      message_id: 42,
      text: 'updated',
      parse_mode: 'HTML'
    });
  });

  it('editMessageCaption posts the caption', async () => {
    fetchMock.mockResolvedValue(okResponse(message));

    await editMessageCaption({ chat_id: -1001, message_id: 42, caption: 'new', parse_mode: 'HTML' });

    expect(lastCall()[0]).toBe(`${BASE}/editMessageCaption`);
    expect(lastJsonBody()).toEqual({
      chat_id: -1001,
      message_id: 42,
      caption: 'new',
      parse_mode: 'HTML'
    });
  });

  it('editMessageMedia JSON-encodes the media object', async () => {
    fetchMock.mockResolvedValue(okResponse(message));

    await editMessageMedia({
      chat_id: -1001,
      message_id: 42,
      media: { type: 'photo', media: 'https://example.com/b.jpg', caption: 'c' }
    });

    const body = lastJsonBody();
    expect(lastCall()[0]).toBe(`${BASE}/editMessageMedia`);
    expect(body.chat_id).toBe(-1001);
    expect(body.message_id).toBe(42);
    expect(JSON.parse(body.media as string)).toEqual({
      type: 'photo',
      media: 'https://example.com/b.jpg',
      caption: 'c'
    });
  });

  it('deleteMessage returns true', async () => {
    fetchMock.mockResolvedValue(okResponse(true));

    await expect(deleteMessage({ chat_id: -1001, message_id: 42 })).resolves.toBe(true);
    expect(lastCall()[0]).toBe(`${BASE}/deleteMessage`);
    expect(lastJsonBody()).toEqual({ chat_id: -1001, message_id: 42 });
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
    fetchMock.mockResolvedValue(apiErrorResponse(400, 'Bad Request: chat not found'));

    const error = await sendMessage({ chat_id: -1, text: 'x' }).catch((e) => e);

    expect(error).toBeInstanceOf(TelegramApiError);
    expect(error.name).toBe('TelegramApiError');
    expect(error.error_code).toBe(400);
    expect(error.description).toBe('Bad Request: chat not found');
    expect(error.method).toBe('sendMessage');
    expect(error.message).toContain('chat not found');
  });

  it('throws TelegramApiError on a non-2xx HTTP status without a body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      }
    } as unknown as Response);

    const error = await deleteMessage({ chat_id: -1001, message_id: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(TelegramApiError);
    expect(error.error_code).toBe(502);
    expect(error.httpStatus).toBe(502);
  });

  it('wraps network failures', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const error = await getFile('F1').catch((e) => e);

    expect(error).toBeInstanceOf(TelegramApiError);
    expect(error.error_code).toBe(0);
    expect(error.description).toBe('ECONNRESET');
  });

  it('throws when TELEGRAM_BOT_TOKEN is missing (read lazily at call time)', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    const error = await sendMessage({ chat_id: -1001, text: 'x' }).catch((e) => e);

    expect(error).toBeInstanceOf(TelegramApiError);
    expect(error.description).toContain('TELEGRAM_BOT_TOKEN');
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

    const error = await sendMessage({ chat_id: -1001, text: 'x' }).catch((e) => e);

    expect(error.parameters).toEqual({ retry_after: 12 });
  });
});

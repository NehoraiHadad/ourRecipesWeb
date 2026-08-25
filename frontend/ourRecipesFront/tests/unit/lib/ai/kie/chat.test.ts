/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { kieChatText } from '@/lib/ai/kie/chat';
import { KieApiError } from '@/lib/ai/kie/client';

const fetchMock = vi.mocked(global.fetch);

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KIE_API_KEY = 'test-key';
});

describe('kieChatText', () => {
  it('posts to the Codex responses endpoint and concatenates message output text', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        output: [
          { type: 'reasoning', content: [{ type: 'text', text: 'ignored' }] },
          { type: 'message', content: [{ type: 'output_text', text: 'שלום ' }, { type: 'output_text', text: 'עולם' }] }
        ],
        usage: { input_tokens: 10, output_tokens: 5, output_tokens_details: { reasoning_tokens: 2 } }
      })
    );

    const text = await kieChatText({ model: 'gpt-5-6-luna', instructions: 'be nice', input: 'hi' });

    expect(text).toBe('שלום עולם');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.kie.ai/codex/v1/responses');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'gpt-5-6-luna',
      stream: false,
      instructions: 'be nice',
      input: 'hi',
      reasoning: { effort: 'low' }
    });
  });

  it('sends a schema as a strict text.format json_schema (and omits text otherwise)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ output: [{ type: 'message', content: [{ text: '{}' }] }] }));

    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false };
    await kieChatText({ model: 'gpt-5-6-luna', instructions: 'x', input: 'y', schema });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string).text).toEqual({
      format: { type: 'json_schema', name: 'response', strict: true, schema }
    });
  });

  it('respects a custom reasoning effort', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ output: [{ type: 'message', content: [{ text: 'ok' }] }] }));

    await kieChatText({ model: 'gpt-5-6-luna', instructions: 'x', input: 'y', reasoningEffort: 'high' });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string).reasoning).toEqual({ effort: 'high' });
  });

  it('throws KieApiError on a non-2xx response with a {code, msg} body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 401, msg: 'unauthorized' }, false, 401));

    await expect(kieChatText({ model: 'gpt-5-6-luna', instructions: 'x', input: 'y' })).rejects.toMatchObject({
      name: 'KieApiError',
      code: 401
    });
  });

  it('throws KieApiError on a non-2xx response with a {status, error, message} body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'error', error: 'rate_limited', message: 'too many requests' }, false, 429)
    );

    await expect(kieChatText({ model: 'gpt-5-6-luna', instructions: 'x', input: 'y' })).rejects.toMatchObject({
      name: 'KieApiError',
      code: 429
    });
  });

  it('throws KieApiError when the output has no message text (treated as a failure)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ output: [{ type: 'reasoning', content: [{ text: 'thinking' }] }] }));

    await expect(kieChatText({ model: 'gpt-5-6-luna', instructions: 'x', input: 'y' })).rejects.toBeInstanceOf(
      KieApiError
    );
  });

  it('throws KieApiError when KIE_API_KEY is unset', async () => {
    delete process.env.KIE_API_KEY;

    await expect(kieChatText({ model: 'gpt-5-6-luna', instructions: 'x', input: 'y' })).rejects.toBeInstanceOf(
      KieApiError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws KieApiError on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(kieChatText({ model: 'gpt-5-6-luna', instructions: 'x', input: 'y' })).rejects.toBeInstanceOf(
      KieApiError
    );
  });
});

/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTask, getTask, KieApiError } from '@/lib/ai/kie/client';

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

describe('createTask', () => {
  it('posts to /jobs/createTask with Bearer auth and returns the taskId', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 200, message: 'success', data: { taskId: 'T1' } }));

    const data = await createTask('nano-banana-2', { prompt: 'x' });

    expect(data).toEqual({ taskId: 'T1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init?.body as string)).toEqual({ model: 'nano-banana-2', input: { prompt: 'x' } });
  });

  it('throws KieApiError when code is not 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 401, msg: 'You do not have access permissions' }));

    await expect(createTask('nano-banana-2', {})).rejects.toMatchObject({
      name: 'KieApiError',
      code: 401
    });
  });

  it('throws KieApiError when KIE_API_KEY is unset', async () => {
    delete process.env.KIE_API_KEY;

    await expect(createTask('nano-banana-2', {})).rejects.toBeInstanceOf(KieApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws KieApiError on network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(createTask('nano-banana-2', {})).rejects.toBeInstanceOf(KieApiError);
  });
});

describe('getTask', () => {
  it('gets /jobs/recordInfo with the taskId as a query param', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 200, message: 'success', data: { taskId: 'T1', model: 'nano-banana-2', state: 'waiting' } })
    );

    const data = await getTask('T1');

    expect(data.state).toBe('waiting');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=T1');
    expect(init?.method).toBe('GET');
  });

  it('throws KieApiError when the HTTP status is not ok', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 500, message: 'boom' }, false, 500));

    await expect(getTask('T1')).rejects.toBeInstanceOf(KieApiError);
  });
});

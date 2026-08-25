/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pollTaskResult, KieTaskFailedError, KieTaskTimeoutError } from '@/lib/ai/kie/poll';
import { getTask } from '@/lib/ai/kie/client';

vi.mock('@/lib/ai/kie/client', () => ({ getTask: vi.fn() }));

const getTaskMock = vi.mocked(getTask);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pollTaskResult', () => {
  it('resolves with resultUrls once the task succeeds, after waiting/generating states', async () => {
    getTaskMock
      .mockResolvedValueOnce({ taskId: 'T1', model: 'm', state: 'waiting' })
      .mockResolvedValueOnce({ taskId: 'T1', model: 'm', state: 'generating' })
      .mockResolvedValueOnce({
        taskId: 'T1',
        model: 'm',
        state: 'success',
        resultJson: JSON.stringify({ resultUrls: ['https://kie.ai/result.jpg'] })
      });

    const promise = pollTaskResult('T1', { initialDelayMs: 10 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual(['https://kie.ai/result.jpg']);
    expect(getTaskMock).toHaveBeenCalledTimes(3);
  });

  it('throws KieTaskFailedError when the task fails', async () => {
    getTaskMock.mockResolvedValueOnce({
      taskId: 'T1',
      model: 'm',
      state: 'fail',
      failCode: 'GEN_ERROR',
      failMsg: 'Content policy violation'
    });

    const promise = pollTaskResult('T1', { initialDelayMs: 10 });
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(KieTaskFailedError);
    await expect(promise).rejects.toMatchObject({ taskId: 'T1', failCode: 'GEN_ERROR' });
  });

  it('throws KieTaskTimeoutError when the task never reaches a terminal state', async () => {
    getTaskMock.mockResolvedValue({ taskId: 'T1', model: 'm', state: 'generating' });

    const promise = pollTaskResult('T1', { initialDelayMs: 10, timeoutMs: 50 });
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(KieTaskTimeoutError);
  });

  it('propagates a KieApiError raised by getTask without retrying', async () => {
    const apiError = new Error('boom');
    getTaskMock.mockRejectedValueOnce(apiError);

    const promise = pollTaskResult('T1', { initialDelayMs: 10 });
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBe(apiError);
    expect(getTaskMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function (this: { apiKey: string }, opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  })
}));

import { GoogleGenAI } from '@google/genai';
import { getGemini, resetGeminiClientForTests } from '@/lib/ai/gemini/client';

const GoogleGenAIMock = vi.mocked(GoogleGenAI);
const ORIGINAL_KEY = process.env.GOOGLE_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  resetGeminiClientForTests();
  process.env.GOOGLE_API_KEY = ORIGINAL_KEY;
});

describe('getGemini', () => {
  it('throws a clear error when GOOGLE_API_KEY is unset', () => {
    delete process.env.GOOGLE_API_KEY;

    expect(() => getGemini()).toThrow(/GOOGLE_API_KEY is not set/);
    expect(GoogleGenAIMock).not.toHaveBeenCalled();
  });

  it('constructs a client with the configured key', () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    const client = getGemini();

    expect(GoogleGenAIMock).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(client).toBeDefined();
  });

  it('caches the client across calls instead of constructing twice', () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    const first = getGemini();
    const second = getGemini();

    expect(first).toBe(second);
    expect(GoogleGenAIMock).toHaveBeenCalledTimes(1);
  });
});

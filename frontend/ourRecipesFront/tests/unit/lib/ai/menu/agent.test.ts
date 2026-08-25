// @vitest-environment node
/**
 * The agent loop. The two behaviours worth pinning down are the ones the
 * pre-rewrite loop got wrong: it executed only `functionCalls[0]` per turn,
 * and a single transient 5xx ended the whole planning session.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GoogleGenAI, Part } from '@google/genai';

vi.mock('@/lib/ai/gemini/client', () => ({ getGemini: vi.fn() }));
vi.mock('@/lib/ai/menu/tools', () => ({ executeMenuTool: vi.fn() }));

import { getGemini } from '@/lib/ai/gemini/client';
import { executeMenuTool } from '@/lib/ai/menu/tools';
import { runMenuAgent, MAX_AGENT_ITERATIONS } from '@/lib/ai/menu/agent';

const sendMessage = vi.fn();
const createChat = vi.fn(() => ({ sendMessage }));

const PREFERENCES = {
  name: 'תפריט שבת',
  servings: 6,
  meal_types: ['ארוחת ערב']
};

/** Minimal stand-in for a `GenerateContentResponse`. */
function modelTurn(options: { calls?: { name: string; args?: unknown }[]; text?: string }) {
  return { functionCalls: options.calls, text: options.text };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGemini).mockReturnValue({ chats: { create: createChat } } as unknown as GoogleGenAI);
  vi.mocked(executeMenuTool).mockResolvedValue({ recipes: [] });
});

describe('runMenuAgent', () => {
  it('returns the model conclusion when the first turn has no tool calls', async () => {
    sendMessage.mockResolvedValueOnce(modelTurn({ text: 'התפריט מוכן' }));

    const result = await runMenuAgent(PREFERENCES);

    expect(result).toEqual({ conclusion: 'התפריט מוכן', iterations: 0 });
    expect(executeMenuTool).not.toHaveBeenCalled();
  });

  it('executes EVERY function call in a turn and sends all responses back together', async () => {
    sendMessage
      .mockResolvedValueOnce(
        modelTurn({
          calls: [
            { name: 'search_recipes', args: { query: 'סלט' } },
            { name: 'search_recipes', args: { query: 'עוף' } },
            { name: 'search_recipes', args: { query: 'קינוח' } }
          ]
        })
      )
      .mockResolvedValueOnce(modelTurn({ text: 'סיכום' }));

    const result = await runMenuAgent(PREFERENCES);

    expect(executeMenuTool).toHaveBeenCalledTimes(3);
    expect(executeMenuTool).toHaveBeenNthCalledWith(2, 'search_recipes', { query: 'עוף' });

    const parts = sendMessage.mock.calls[1][0].message as Part[];
    expect(parts).toHaveLength(3);
    expect(parts[0].functionResponse).toMatchObject({ name: 'search_recipes' });
    expect(result.iterations).toBe(1);
  });

  it('re-sends the tool declarations on every turn (per-request config does not inherit)', async () => {
    sendMessage
      .mockResolvedValueOnce(modelTurn({ calls: [{ name: 'search_recipes' }] }))
      .mockResolvedValueOnce(modelTurn({ text: 'סיכום' }));

    await runMenuAgent(PREFERENCES);

    for (const call of sendMessage.mock.calls) {
      expect(call[0].config.tools[0].functionDeclarations).toHaveLength(3);
      expect(call[0].config.abortSignal).toBeDefined();
    }
  });

  it('hands a failing tool back to the model instead of aborting the session', async () => {
    vi.mocked(executeMenuTool).mockRejectedValueOnce(new Error('db down'));
    sendMessage
      .mockResolvedValueOnce(modelTurn({ calls: [{ name: 'get_recipes_details' }] }))
      .mockResolvedValueOnce(modelTurn({ text: 'סיכום' }));

    const result = await runMenuAgent(PREFERENCES);

    const parts = sendMessage.mock.calls[1][0].message as Part[];
    expect(parts[0].functionResponse?.response).toMatchObject({ error: expect.any(String) });
    expect(result.conclusion).toBe('סיכום');
  });

  it('retries a transient 503 on a model turn', async () => {
    const transient = Object.assign(new Error('overloaded'), { status: 503 });
    sendMessage
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce(modelTurn({ text: 'סיכום אחרי ניסיון שני' }));

    const result = await runMenuAgent(PREFERENCES);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(result.conclusion).toBe('סיכום אחרי ניסיון שני');
  });

  it('stops at the iteration cap and asks for a summary without tools', async () => {
    sendMessage.mockResolvedValue(modelTurn({ calls: [{ name: 'search_recipes' }], text: '' }));
    sendMessage.mockResolvedValueOnce(modelTurn({ calls: [{ name: 'search_recipes' }] }));

    const result = await runMenuAgent(PREFERENCES);

    expect(executeMenuTool).toHaveBeenCalledTimes(MAX_AGENT_ITERATIONS);
    // kickoff + one send per iteration + the tool-free wrap-up turn.
    expect(sendMessage).toHaveBeenCalledTimes(MAX_AGENT_ITERATIONS + 2);
    const wrapUp = sendMessage.mock.calls[MAX_AGENT_ITERATIONS + 1][0];
    expect(wrapUp.config.tools).toBeUndefined();
    expect(result.iterations).toBe(MAX_AGENT_ITERATIONS);
  });
});

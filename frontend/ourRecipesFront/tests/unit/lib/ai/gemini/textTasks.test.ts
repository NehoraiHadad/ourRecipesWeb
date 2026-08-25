/**
 * @vitest-environment node
 *
 * Routing coverage for the hybrid LLM setup: reformat / suggest / refine
 * default to KIE and fall back to direct Gemini on any KIE failure; an env
 * override to `gemini:...` skips KIE entirely.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/ai/kie', () => ({ kieChatText: vi.fn(), kieGeminiJson: vi.fn() }));
vi.mock('@/lib/ai/gemini/generate', () => ({ generateText: vi.fn(), generateJson: vi.fn() }));

import { kieChatText, kieGeminiJson } from '@/lib/ai/kie';
import { generateText, generateJson } from '@/lib/ai/gemini/generate';
import { GEMINI_TEXT_FALLBACK_MODEL } from '@/lib/ai/models';
import { buildReformatPrompt, buildSuggestionPrompt, buildRefinePrompt } from '@/lib/ai/gemini/prompts';
import { reformatRecipe, generateRecipeSuggestion, refineRecipe, optimizeRecipeSteps } from '@/lib/ai/gemini/textTasks';

const kieChatTextMock = vi.mocked(kieChatText);
const kieGeminiJsonMock = vi.mocked(kieGeminiJson);
const generateTextMock = vi.mocked(generateText);
const generateJsonMock = vi.mocked(generateJson);

const ENV_KEYS = ['AI_MODEL_REFORMAT', 'AI_MODEL_SUGGEST', 'AI_MODEL_REFINE', 'AI_MODEL_OPTIMIZE_STEPS'];

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('reformatRecipe', () => {
  it('uses the KIE provider by default and never touches Gemini on success', async () => {
    kieChatTextMock.mockResolvedValue('🍳 עוגה\n...');

    const result = await reformatRecipe('raw recipe text');

    expect(result).toBe('🍳 עוגה\n...');
    expect(kieChatTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-5-6-luna', instructions: expect.any(String), input: expect.any(String) })
    );
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('falls back to Gemini with the original prompt when the KIE call fails', async () => {
    kieChatTextMock.mockRejectedValue(new Error('KIE down'));
    generateTextMock.mockResolvedValue('🍳 fallback');

    const result = await reformatRecipe('raw recipe text');

    expect(result).toBe('🍳 fallback');
    expect(generateTextMock).toHaveBeenCalledWith({
      model: GEMINI_TEXT_FALLBACK_MODEL,
      prompt: buildReformatPrompt('raw recipe text')
    });
  });

  it('goes straight to Gemini when the task is overridden to the gemini provider', async () => {
    process.env.AI_MODEL_REFORMAT = 'gemini:gemini-3.7-flash';
    generateTextMock.mockResolvedValue('🍳 direct gemini');

    const result = await reformatRecipe('raw recipe text');

    expect(result).toBe('🍳 direct gemini');
    expect(kieChatTextMock).not.toHaveBeenCalled();
    expect(generateTextMock).toHaveBeenCalledWith({ model: 'gemini-3.7-flash', prompt: buildReformatPrompt('raw recipe text') });
  });
});

describe('generateRecipeSuggestion', () => {
  const params = { ingredients: 'עגבניות', mealType: ['ארוחת ערב'] };

  it('routes through KIE by default', async () => {
    kieChatTextMock.mockResolvedValue('🍳 מתכון חדש');

    const result = await generateRecipeSuggestion(params);

    expect(result).toBe('🍳 מתכון חדש');
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('falls back to Gemini on a KIE failure', async () => {
    kieChatTextMock.mockRejectedValue(new Error('timeout'));
    generateTextMock.mockResolvedValue('🍳 fallback suggestion');

    const result = await generateRecipeSuggestion(params);

    expect(result).toBe('🍳 fallback suggestion');
    expect(generateTextMock).toHaveBeenCalledWith({
      model: GEMINI_TEXT_FALLBACK_MODEL,
      prompt: buildSuggestionPrompt(params)
    });
  });
});

describe('refineRecipe', () => {
  it('routes through KIE by default', async () => {
    kieChatTextMock.mockResolvedValue('🍳 מתכון משופר');

    const result = await refineRecipe('recipe text', 'תוסיף פחות סוכר');

    expect(result).toBe('🍳 מתכון משופר');
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('falls back to Gemini on a KIE failure', async () => {
    kieChatTextMock.mockRejectedValue(new Error('empty output'));
    generateTextMock.mockResolvedValue('🍳 fallback refine');

    const result = await refineRecipe('recipe text', 'תוסיף פחות סוכר');

    expect(result).toBe('🍳 fallback refine');
    expect(generateTextMock).toHaveBeenCalledWith({
      model: GEMINI_TEXT_FALLBACK_MODEL,
      prompt: buildRefinePrompt('recipe text', 'תוסיף פחות סוכר')
    });
  });
});

describe('optimizeRecipeSteps', () => {
  it('routes through the KIE Gemini proxy by default, never direct Gemini on success', async () => {
    kieGeminiJsonMock.mockResolvedValue('{"steps": []}');

    const result = await optimizeRecipeSteps('recipe text');

    expect(result).toEqual({ steps: [] });
    expect(kieGeminiJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3-7-flash', prompt: expect.any(String), schema: expect.any(Object) })
    );
    expect(generateJsonMock).not.toHaveBeenCalled();
  });

  it('falls back to direct Gemini with low thinking when the KIE call fails', async () => {
    kieGeminiJsonMock.mockRejectedValue(new Error('KIE down'));
    generateJsonMock.mockResolvedValue('{"steps": []}');

    const result = await optimizeRecipeSteps('recipe text');

    expect(result).toEqual({ steps: [] });
    expect(generateJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: GEMINI_TEXT_FALLBACK_MODEL,
        config: expect.objectContaining({ thinkingConfig: expect.anything() })
      })
    );
  });

  it('goes straight to direct Gemini when overridden to the gemini provider', async () => {
    process.env.AI_MODEL_OPTIMIZE_STEPS = 'gemini:gemini-3.7-flash';
    generateJsonMock.mockResolvedValue('{"steps": []}');

    await optimizeRecipeSteps('recipe text');

    expect(kieGeminiJsonMock).not.toHaveBeenCalled();
    expect(generateJsonMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.7-flash' }));
  });

  it('returns null for a non-JSON response', async () => {
    kieGeminiJsonMock.mockResolvedValue('not json');

    expect(await optimizeRecipeSteps('recipe text')).toBeNull();
  });
});

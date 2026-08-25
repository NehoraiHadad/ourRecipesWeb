/**
 * @vitest-environment node
 *
 * Routing coverage for the JSON-first setup: the recipe tasks default to KIE
 * GPT-5.6 Luna with a strict json_schema, fall back to direct Gemini on any
 * KIE failure, and always return the canonical channel text derived from the
 * model's JSON; optimize_steps rides the same generator through KIE's native
 * Gemini proxy.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/ai/kie', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/kie')>()),
  kieChatText: vi.fn(),
  kieGeminiJson: vi.fn()
}));
vi.mock('@/lib/ai/gemini/generate', () => ({ generateText: vi.fn(), generateJson: vi.fn() }));

import { kieChatText, kieGeminiJson } from '@/lib/ai/kie';
import { generateJson } from '@/lib/ai/gemini/generate';
import { GEMINI_TEXT_FALLBACK_MODEL } from '@/lib/ai/models';
import { reformatRecipe, generateRecipeSuggestion, refineRecipe, optimizeRecipeSteps } from '@/lib/ai/gemini/textTasks';

const kieChatTextMock = vi.mocked(kieChatText);
const kieGeminiJsonMock = vi.mocked(kieGeminiJson);
const generateJsonMock = vi.mocked(generateJson);

const RECIPE_JSON = JSON.stringify({
  title: 'עוגת שוקולד',
  categories: ['קינוחים'],
  preparation_time: 45,
  difficulty: 'קל',
  ingredients: ['2 כוסות קמח', '3 ביצים'],
  instructions: ['לערבב הכל', 'לאפות 40 דקות'],
  tips: []
});

const EXPECTED_TEXT = [
  'כותרת: עוגת שוקולד',
  'קטגוריות: קינוחים',
  'זמן הכנה: 45 דקות',
  'רמת קושי: קל',
  'רשימת מצרכים:',
  '- 2 כוסות קמח',
  '- 3 ביצים',
  'הוראות הכנה:',
  '1. לערבב הכל',
  '2. לאפות 40 דקות'
].join('\n');

const ENV_KEYS = ['AI_MODEL_REFORMAT', 'AI_MODEL_SUGGEST', 'AI_MODEL_REFINE', 'AI_MODEL_OPTIMIZE_STEPS'];

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('reformatRecipe', () => {
  it('asks KIE Luna for strict JSON by default and returns the canonical channel text', async () => {
    kieChatTextMock.mockResolvedValue(RECIPE_JSON);

    const result = await reformatRecipe('raw recipe text');

    expect(result).toBe(EXPECTED_TEXT);
    expect(kieChatTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5-6-luna',
        instructions: expect.any(String),
        input: expect.stringContaining('raw recipe text'),
        schema: expect.objectContaining({ type: 'object', additionalProperties: false })
      })
    );
    expect(generateJsonMock).not.toHaveBeenCalled();
  });

  it('falls back to direct Gemini structured output when the KIE call fails', async () => {
    kieChatTextMock.mockRejectedValue(new Error('KIE down'));
    generateJsonMock.mockResolvedValue(RECIPE_JSON);

    const result = await reformatRecipe('raw recipe text');

    expect(result).toBe(EXPECTED_TEXT);
    expect(generateJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: GEMINI_TEXT_FALLBACK_MODEL,
        schema: expect.any(Object),
        config: expect.objectContaining({ thinkingConfig: expect.anything() })
      })
    );
  });

  it('goes straight to Gemini when the task is overridden to the gemini provider', async () => {
    process.env.AI_MODEL_REFORMAT = 'gemini:gemini-3.7-flash';
    generateJsonMock.mockResolvedValue(RECIPE_JSON);

    const result = await reformatRecipe('raw recipe text');

    expect(result).toBe(EXPECTED_TEXT);
    expect(kieChatTextMock).not.toHaveBeenCalled();
    expect(generateJsonMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.7-flash' }));
  });

  it('routes a kie gemini-family override through the native Gemini proxy', async () => {
    process.env.AI_MODEL_REFORMAT = 'kie:gemini-3-7-flash';
    kieGeminiJsonMock.mockResolvedValue(RECIPE_JSON);

    const result = await reformatRecipe('raw recipe text');

    expect(result).toBe(EXPECTED_TEXT);
    expect(kieChatTextMock).not.toHaveBeenCalled();
    expect(kieGeminiJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3-7-flash', schema: expect.any(Object) })
    );
  });

  it('throws when the model returns JSON missing the essentials', async () => {
    kieChatTextMock.mockResolvedValue(JSON.stringify({ title: 'עוגה', ingredients: [], instructions: [] }));

    await expect(reformatRecipe('raw recipe text')).rejects.toThrow(/invalid recipe/);
  });
});

describe('generateRecipeSuggestion', () => {
  const params = { ingredients: 'עגבניות', mealType: ['ארוחת ערב'] };

  it('routes through KIE Luna by default and derives the channel text', async () => {
    kieChatTextMock.mockResolvedValue(RECIPE_JSON);

    const result = await generateRecipeSuggestion(params);

    expect(result).toBe(EXPECTED_TEXT);
    expect(kieChatTextMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5-6-luna' }));
    expect(generateJsonMock).not.toHaveBeenCalled();
  });

  it('falls back to Gemini on a KIE failure', async () => {
    kieChatTextMock.mockRejectedValue(new Error('timeout'));
    generateJsonMock.mockResolvedValue(RECIPE_JSON);

    const result = await generateRecipeSuggestion(params);

    expect(result).toBe(EXPECTED_TEXT);
    expect(generateJsonMock).toHaveBeenCalledWith(expect.objectContaining({ model: GEMINI_TEXT_FALLBACK_MODEL }));
  });
});

describe('refineRecipe', () => {
  it('routes through KIE Luna by default and derives the channel text', async () => {
    kieChatTextMock.mockResolvedValue(RECIPE_JSON);

    const result = await refineRecipe('recipe text', 'תוסיף פחות סוכר');

    expect(result).toBe(EXPECTED_TEXT);
    expect(kieChatTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-5-6-luna', input: expect.stringContaining('תוסיף פחות סוכר') })
    );
  });

  it('falls back to Gemini on a KIE failure', async () => {
    kieChatTextMock.mockRejectedValue(new Error('empty output'));
    generateJsonMock.mockResolvedValue(RECIPE_JSON);

    const result = await refineRecipe('recipe text', 'תוסיף פחות סוכר');

    expect(result).toBe(EXPECTED_TEXT);
    expect(generateJsonMock).toHaveBeenCalledWith(expect.objectContaining({ model: GEMINI_TEXT_FALLBACK_MODEL }));
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

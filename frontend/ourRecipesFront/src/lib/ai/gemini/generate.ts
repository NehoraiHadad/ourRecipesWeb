/**
 * Thin wrappers around `GoogleGenAI.models.generateContent`, adding retry +
 * timeout via `withRetry`. Callers own prompts and response parsing.
 */
import type { GenerateContentConfig, Schema } from '@google/genai';
import { getGemini } from './client';
import { withRetry } from './retry';

export interface GenerateTextOptions {
  model: string;
  prompt: string;
  config?: GenerateContentConfig;
}

export async function generateText({ model, prompt, config }: GenerateTextOptions): Promise<string> {
  const response = await withRetry((signal) =>
    getGemini().models.generateContent({
      model,
      contents: prompt,
      config: { ...config, abortSignal: signal }
    })
  );
  return response.text ?? '';
}

export interface GenerateJsonOptions {
  model: string;
  prompt: string;
  schema: Schema;
}

/**
 * Generate JSON via Gemini's structured-output mode. Returns the raw text —
 * callers parse and validate it (e.g. `optimizeRecipeSteps` against
 * `parseOptimizedSteps`).
 */
export async function generateJson({ model, prompt, schema }: GenerateJsonOptions): Promise<string> {
  return generateText({
    model,
    prompt,
    config: { responseMimeType: 'application/json', responseSchema: schema }
  });
}

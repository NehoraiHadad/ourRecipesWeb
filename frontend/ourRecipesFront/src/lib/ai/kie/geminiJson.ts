/**
 * KIE.ai Gemini proxy — structured-JSON generation through KIE's native
 * Gemini endpoint (`/gemini/v1/models/<model>:streamGenerateContent` with
 * `stream: false`). Same request/response wire format as Google's own REST
 * API, including `responseSchema`, so `@google/genai`'s `Schema` objects
 * serialize straight into it.
 *
 * Exists because direct Google calls proved unreliable under load in
 * production (503s and >45s hangs on 2026-08-25 took `optimize-steps` down
 * with a 504), while the same model answered in ~6s through KIE. KIE model
 * ids use dashes (`gemini-3-7-flash`), not dots.
 */
import type { Schema } from '@google/genai';
import { logger } from '@/lib/logger';
import { KieApiError } from './client';

const GEMINI_API_ROOT = 'https://api.kie.ai/gemini/v1/models';
const HTTP_TIMEOUT_MS = 60_000;

const log = logger.child({ context: 'ai/kie/geminiJson' });

export interface KieGeminiJsonOptions {
  model: string;
  prompt: string;
  schema: Schema;
}

interface KieGeminiResponseBody {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
  credits_consumed?: number;
  error?: { code?: number; message?: string };
}

function getApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) {
    throw new KieApiError({ method: 'geminiJson', code: 0, description: 'KIE_API_KEY is not configured' });
  }
  return key;
}

/**
 * Generates schema-constrained JSON and returns the raw text — callers parse
 * and validate, exactly like `gemini/generate.ts#generateJson`. Throws
 * `KieApiError` on any failure (missing key, network, non-2xx, in-body error,
 * empty answer) so callers can fall back to direct Gemini on any throw.
 */
export async function kieGeminiJson({ model, prompt, schema }: KieGeminiJsonOptions): Promise<string> {
  const key = getApiKey();

  let response: Response;
  try {
    response = await fetch(`${GEMINI_API_ROOT}/${model}:streamGenerateContent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stream: false,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: 'low' }
        }
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });
  } catch (error) {
    throw new KieApiError({
      method: 'geminiJson',
      code: 0,
      description: error instanceof Error ? error.message : 'Network request failed',
      cause: error
    });
  }

  let body: KieGeminiResponseBody | null = null;
  try {
    body = (await response.json()) as KieGeminiResponseBody;
  } catch {
    body = null;
  }

  if (!response.ok || body?.error) {
    const description = body?.error?.message ?? `HTTP ${response.status}`;
    const error = new KieApiError({ method: 'geminiJson', code: body?.error?.code ?? response.status, description });
    log.warn({ model, code: error.code, description }, 'KIE Gemini JSON call failed');
    throw error;
  }

  const text = (body?.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
  if (!text) {
    log.warn({ model }, 'KIE Gemini JSON call returned empty text');
    throw new KieApiError({ method: 'geminiJson', code: 0, description: 'KIE Gemini returned empty text' });
  }

  log.info({ model, usage: body?.usageMetadata, credits: body?.credits_consumed }, 'KIE Gemini JSON call succeeded');
  return text;
}

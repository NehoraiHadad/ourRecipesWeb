/**
 * Lazy, cached `GoogleGenAI` clients.
 *
 * The pre-migration code built this at module load with
 * `apiKey: process.env.GOOGLE_API_KEY || ''`, so a missing key silently
 * produced a client that failed deep inside the SDK with a confusing 401.
 * This throws a clear error at call time instead.
 *
 * `getGeminiVia('kie')` returns the same SDK pointed at KIE's native Gemini
 * proxy (`https://api.kie.ai/gemini/v1/...`, Bearer auth) — the full wire
 * format including multi-turn function calling passes through unchanged
 * (verified live 2026-08-25). Used because the direct Google key is free-tier
 * and unreliable; KIE Gemini model ids use dashes (`gemini-3-7-flash`).
 */
import { GoogleGenAI } from '@google/genai';

const cached: Partial<Record<'google' | 'kie', GoogleGenAI>> = {};

export function getGemini(): GoogleGenAI {
  if (cached.google) return cached.google;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set — Gemini text generation is unavailable');
  }

  cached.google = new GoogleGenAI({ apiKey });
  return cached.google;
}

/** The Gemini SDK backed by KIE's proxy (`provider: 'kie'`) or Google directly. */
export function getGeminiVia(provider: 'gemini' | 'kie'): GoogleGenAI {
  if (provider === 'gemini') return getGemini();
  if (cached.kie) return cached.kie;

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    throw new Error('KIE_API_KEY is not set — KIE-proxied Gemini is unavailable');
  }

  cached.kie = new GoogleGenAI({
    apiKey,
    httpOptions: {
      baseUrl: 'https://api.kie.ai/gemini',
      apiVersion: 'v1',
      headers: { Authorization: `Bearer ${apiKey}` }
    }
  });
  return cached.kie;
}

/** Test-only: drop the cached clients so a test can exercise the missing-key path. */
export function resetGeminiClientForTests(): void {
  delete cached.google;
  delete cached.kie;
}

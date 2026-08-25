/**
 * Lazy, cached `GoogleGenAI` client.
 *
 * The pre-migration code built this at module load with
 * `apiKey: process.env.GOOGLE_API_KEY || ''`, so a missing key silently
 * produced a client that failed deep inside the SDK with a confusing 401.
 * This throws a clear error at call time instead.
 */
import { GoogleGenAI } from '@google/genai';

let cached: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set — Gemini text generation is unavailable');
  }

  cached = new GoogleGenAI({ apiKey });
  return cached;
}

/** Test-only: drop the cached client so a test can exercise the missing-key path. */
export function resetGeminiClientForTests(): void {
  cached = null;
}

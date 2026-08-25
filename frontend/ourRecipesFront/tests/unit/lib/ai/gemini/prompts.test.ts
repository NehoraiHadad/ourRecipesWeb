// @vitest-environment node
/**
 * Regression for the /api/recipes/suggest 500: the form sends `mealType` as a
 * single string while the prompt builders `.join()` an array — the boundary
 * must normalize both shapes.
 */
import { describe, it, expect } from 'vitest';
import { normalizeMealTypes, buildSuggestionPrompt } from '@/lib/ai/gemini/prompts';

describe('normalizeMealTypes', () => {
  it('wraps the single string the form sends', () => {
    expect(normalizeMealTypes('ארוחת בוקר')).toEqual(['ארוחת בוקר']);
  });

  it('keeps a string array, dropping empty entries', () => {
    expect(normalizeMealTypes(['ארוחת ערב', '', '  צהריים '])).toEqual(['ארוחת ערב', 'צהריים']);
  });

  it('returns undefined for empty, missing or non-string values', () => {
    expect(normalizeMealTypes('')).toBeUndefined();
    expect(normalizeMealTypes(undefined)).toBeUndefined();
    expect(normalizeMealTypes(null)).toBeUndefined();
    expect(normalizeMealTypes(7)).toBeUndefined();
    expect(normalizeMealTypes([])).toBeUndefined();
  });

  it('feeds buildSuggestionPrompt without crashing on the form payload', () => {
    const prompt = buildSuggestionPrompt({ mealType: normalizeMealTypes('ארוחת בוקר') });
    expect(prompt).toContain('סוג ארוחה: ארוחת בוקר');
  });
});

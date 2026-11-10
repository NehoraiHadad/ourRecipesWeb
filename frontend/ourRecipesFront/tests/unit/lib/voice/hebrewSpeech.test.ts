import { describe, expect, it } from 'vitest';
import { normalizeHebrewSpeech } from '../../../../public/voice/hebrew-speech.js';
describe('Pocket Hebrew speech preparation (deterministic values, no model)', () => {
  it('retains quantities, fractions, decimal precision and temperature ranges as words', () => {
    expect(normalizeHebrewSpeech('להוסיף 2 כפות קמח ו־1/2 כוס מים.')).toBe('להוסיף שתי כפות קמח ו־חצי כוס מים.');
    expect(normalizeHebrewSpeech('לאפות ב־180 מעלות במשך 10–15 דקות.')).toBe('לאפות ב־מאה שמונים מעלות במשך עשר עד חמש עשרה דקות.');
    expect(normalizeHebrewSpeech('להוסיף 2½ כוסות ו־1.05 גרם')).toBe('להוסיף שתיים וחצי כוסות ו־אחת נקודה אפס חמש גרם');
    expect(normalizeHebrewSpeech('להוסיף 1 1/2 כוסות')).toContain('אחת וחצי');
    expect(normalizeHebrewSpeech('3/8')).toBe('שלוש חלקי שמונה');
  });
  it('preserves Hebrew instructions without adding amounts or actions', () => {
    expect(normalizeHebrewSpeech('להוסיף מים ולערבב.')).toBe('להוסיף מים ולערבב.');
  });
  it('rejects unsupported mixed text/numbers before G2P can silently drop symbols', () => {
    for (const text of ['180C', 'מים / flour', 'בשעה 14:30', '10000 גרם', '1/0 כוס', 'לבשל + לערבב']) expect(() => normalizeHebrewSpeech(text)).toThrow();
  });
});

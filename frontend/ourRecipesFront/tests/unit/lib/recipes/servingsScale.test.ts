/**
 * Servings multiplier (STRUCTURE_REFACTOR_TASKS.md §D1): scaling happens on
 * the structured quantity, and anything `quantityAsNumber` cannot turn into a
 * single number is passed through untouched.
 */
import { describe, it, expect } from 'vitest';
import { parseIngredientLine } from '@/lib/recipes/ingredientParser';
import {
  formatScaledQuantity,
  scaleIngredient,
  scaleIngredientForDisplay
} from '@/lib/recipes/servingsScale';

const scaledText = (line: string, multiplier: number) =>
  scaleIngredientForDisplay(parseIngredientLine(line), multiplier).text;

describe('formatScaledQuantity', () => {
  it('writes whole numbers plainly', () => {
    expect(formatScaledQuantity(2)).toBe('2');
    expect(formatScaledQuantity(1)).toBe('1');
  });

  it('writes standalone fractions as Hebrew words', () => {
    expect(formatScaledQuantity(0.5)).toBe('חצי');
    expect(formatScaledQuantity(0.25)).toBe('רבע');
    expect(formatScaledQuantity(0.75)).toBe('שלושת רבעי');
    expect(formatScaledQuantity(1 / 3)).toBe('שליש');
  });

  it('writes mixed numbers with the additive form', () => {
    expect(formatScaledQuantity(1.5)).toBe('1 וחצי');
    expect(formatScaledQuantity(2.25)).toBe('2 ורבע');
    expect(formatScaledQuantity(3.75)).toBe('3 ושלושת רבעי');
  });

  it('falls back to a short decimal when there is no tidy Hebrew form', () => {
    expect(formatScaledQuantity(0.2)).toBe('0.2');
    expect(formatScaledQuantity(1.1)).toBe('1.1');
  });

  it('has nothing to write for a non-positive or invalid value', () => {
    expect(formatScaledQuantity(0)).toBe('');
    expect(formatScaledQuantity(Number.NaN)).toBe('');
  });
});

describe('scaleIngredient', () => {
  it('multiplies a numeric quantity', () => {
    expect(scaledText('2 כפות סוכר', 2)).toBe('4 כפות סוכר');
    expect(scaledText('2 כפות סוכר', 0.5)).toBe('1 כפות סוכר');
  });

  it('multiplies a fraction written as a word or a symbol', () => {
    expect(scaledText('חצי כוס קמח', 3)).toBe('1 וחצי כוס קמח');
    expect(scaledText('1/2 כוס חלב', 2)).toBe('1 כוס חלב');
    expect(scaledText('2 וחצי כוסות מים', 2)).toBe('5 כוסות מים');
  });

  it('leaves a range untouched — quantityAsNumber has no honest number for it', () => {
    expect(scaledText('2-3 שיני שום', 2)).toBe('2-3 שיני שום');
  });

  it('leaves a quantity-less ingredient untouched', () => {
    expect(scaledText('מלח לפי הטעם', 2)).toBe('מלח לפי הטעם');
  });

  it('returns the very same object at 1X', () => {
    const ingredient = parseIngredientLine('2 כפות סוכר');
    expect(scaleIngredient(ingredient, 1)).toBe(ingredient);
  });

  it('keeps the note and splits the line into measure / name', () => {
    const display = scaleIngredientForDisplay(parseIngredientLine('2 כוסות קמח (מנופה)'), 2);
    expect(display).toMatchObject({ measure: '4 כוסות', name: 'קמח', note: 'מנופה' });
    expect(display.text).toBe('4 כוסות קמח (מנופה)');
  });
});

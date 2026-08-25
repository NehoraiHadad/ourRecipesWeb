import { describe, it, expect } from 'vitest';
import {
  formatIngredient,
  parseIngredientLine,
  quantityAsNumber,
  type StructuredIngredient
} from '@/lib/recipes/ingredientParser';

describe('parseIngredientLine — quantity + unit + name', () => {
  it('parses the plain "quantity unit name" shape', () => {
    expect(parseIngredientLine('2 כפות סוכר')).toEqual({
      quantity: 2,
      unit: 'כפות',
      name: 'סוכר'
    });
  });

  it('keeps a plain numeral as a number, including decimals', () => {
    expect(parseIngredientLine('1.5 כוס קמח')).toEqual({
      quantity: 1.5,
      unit: 'כוס',
      name: 'קמח'
    });
  });

  it('normalises surrounding and repeated whitespace', () => {
    expect(parseIngredientLine('   2    כפות    סוכר  ')).toEqual({
      quantity: 2,
      unit: 'כפות',
      name: 'סוכר'
    });
  });

  it('recognises multi-word names after the unit', () => {
    expect(parseIngredientLine('3 כפות שמן זית')).toEqual({
      quantity: 3,
      unit: 'כפות',
      name: 'שמן זית'
    });
  });

  it('recognises units written with quotes', () => {
    expect(parseIngredientLine('1 ק"ג בשר טחון')).toEqual({
      quantity: 1,
      unit: 'ק"ג',
      name: 'בשר טחון'
    });
  });

  it('leaves a non-unit word in the name', () => {
    expect(parseIngredientLine('2 ביצים')).toEqual({ quantity: 2, name: 'ביצים' });
  });

  it('treats a trailing unit with nothing left to name as the name itself', () => {
    expect(parseIngredientLine('2 כוסות')).toEqual({ quantity: 2, name: 'כוסות' });
  });

  it('keeps the "של" connector so no word is lost', () => {
    expect(parseIngredientLine('חצי חבילה של שוקולד')).toEqual({
      quantity: 'חצי',
      unit: 'חבילה',
      name: 'של שוקולד'
    });
  });
});

describe('parseIngredientLine — fractions', () => {
  it('keeps a slash fraction verbatim', () => {
    expect(parseIngredientLine('1/2 כוס סוכר')).toEqual({
      quantity: '1/2',
      unit: 'כוס',
      name: 'סוכר'
    });
  });

  it('keeps a unicode fraction verbatim', () => {
    expect(parseIngredientLine('½ כפית מלח')).toEqual({
      quantity: '½',
      unit: 'כפית',
      name: 'מלח'
    });
    expect(parseIngredientLine('¾ כוס חלב')).toEqual({
      quantity: '¾',
      unit: 'כוס',
      name: 'חלב'
    });
  });

  it('parses the Hebrew fraction words', () => {
    expect(parseIngredientLine('חצי כוס שמן')).toEqual({
      quantity: 'חצי',
      unit: 'כוס',
      name: 'שמן'
    });
    expect(parseIngredientLine('רבע כפית קינמון')).toEqual({
      quantity: 'רבע',
      unit: 'כפית',
      name: 'קינמון'
    });
  });

  it('parses the mixed "2 וחצי" form', () => {
    expect(parseIngredientLine('2 וחצי כוסות קמח')).toEqual({
      quantity: '2 וחצי',
      unit: 'כוסות',
      name: 'קמח'
    });
  });

  it('parses the mixed numeric fraction "2 1/2"', () => {
    expect(parseIngredientLine('2 1/2 כוסות קמח')).toEqual({
      quantity: '2 1/2',
      unit: 'כוסות',
      name: 'קמח'
    });
  });

  it('parses the unit-first "כוס וחצי" form with its implied leading 1', () => {
    expect(parseIngredientLine('כוס וחצי קמח')).toEqual({
      quantity: '1 וחצי',
      unit: 'כוס',
      name: 'קמח'
    });
  });
});

describe('parseIngredientLine — ranges and percentages', () => {
  it('keeps a range as a string quantity', () => {
    expect(parseIngredientLine('2-3 ביצים')).toEqual({ quantity: '2-3', name: 'ביצים' });
  });

  it('keeps a spaced range as a string quantity', () => {
    expect(parseIngredientLine('1 - 2 כפות דבש')).toEqual({
      quantity: '1 - 2',
      unit: 'כפות',
      name: 'דבש'
    });
  });

  it('treats a leading percentage range as part of the name, not a quantity', () => {
    expect(parseIngredientLine('70-80% קקאו')).toEqual({ name: '70-80% קקאו' });
  });

  it('leaves a mid-line percentage range inside the name', () => {
    expect(parseIngredientLine('100 גרם שוקולד מריר 70-80% קקאו')).toEqual({
      quantity: 100,
      unit: 'גרם',
      name: 'שוקולד מריר 70-80% קקאו'
    });
  });
});

describe('parseIngredientLine — notes', () => {
  it('extracts a parenthesised note', () => {
    expect(parseIngredientLine('בצל (קצוץ דק)')).toEqual({ name: 'בצל', note: 'קצוץ דק' });
  });

  it('extracts a note alongside a quantity and unit', () => {
    expect(parseIngredientLine('2 שיני שום (כתושות)')).toEqual({
      quantity: 2,
      unit: 'שיני',
      name: 'שום',
      note: 'כתושות'
    });
  });

  it('joins multiple parenthesised notes', () => {
    expect(parseIngredientLine('חמאה (רכה) (בטמפרטורת החדר)')).toEqual({
      name: 'חמאה',
      note: 'רכה, בטמפרטורת החדר'
    });
  });

  it('extracts a dash-introduced trailing note', () => {
    expect(parseIngredientLine('פלפל שחור - לפי הטעם')).toEqual({
      name: 'פלפל שחור',
      note: 'לפי הטעם'
    });
  });
});

describe('parseIngredientLine — graceful failure', () => {
  it('puts an unmeasured ingredient entirely in the name', () => {
    expect(parseIngredientLine('מלח לפי הטעם')).toEqual({ name: 'מלח לפי הטעם' });
  });

  it('puts unparseable junk entirely in the name', () => {
    expect(parseIngredientLine('!!! ??? ***')).toEqual({ name: '!!! ??? ***' });
    expect(parseIngredientLine('7')).toEqual({ name: '7' });
  });

  it('never throws and returns an empty name for empty input', () => {
    expect(parseIngredientLine('')).toEqual({ name: '' });
    expect(parseIngredientLine('   ')).toEqual({ name: '' });
  });

  it('never loses a word: every source word survives into the parts', () => {
    const lines = [
      'חצי חבילה של שוקולד',
      '100 גרם שוקולד מריר 70-80% קקאו',
      '2 שיני שום (כתושות)',
      'מלח לפי הטעם'
    ];

    for (const line of lines) {
      const parsed = parseIngredientLine(line);
      const words = [parsed.quantity, parsed.unit, parsed.name, parsed.note]
        .filter((part) => part !== undefined && part !== '')
        .join(' ')
        .split(/\s+/);
      for (const word of line.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)) {
        expect(words).toContain(word);
      }
    }
  });
});

const ROUND_TRIP_LINES = [
  '2 כפות סוכר',
  '1.5 כוס קמח',
  '1/2 כוס סוכר',
  '½ כפית מלח',
  '2 1/2 כוסות קמח',
  'חצי כוס שמן',
  'רבע כפית קינמון',
  '2 וחצי כוסות קמח',
  'חצי חבילה של שוקולד',
  '2-3 ביצים',
  '70-80% קקאו',
  '100 גרם שוקולד מריר 70-80% קקאו',
  '2 שיני שום (כתושות)',
  'בצל (קצוץ דק)',
  'מלח לפי הטעם',
  '2 כוסות',
  '!!! ??? ***'
];

describe('formatIngredient', () => {
  it('reproduces the original line for every canonical form', () => {
    for (const line of ROUND_TRIP_LINES) {
      expect(formatIngredient(parseIngredientLine(line))).toBe(line);
    }
  });

  it('re-parses to exactly the same parts (parse ∘ format is stable)', () => {
    for (const line of [...ROUND_TRIP_LINES, 'כוס וחצי קמח', 'פלפל שחור - לפי הטעם']) {
      const parsed = parseIngredientLine(line);
      expect(parseIngredientLine(formatIngredient(parsed))).toEqual(parsed);
    }
  });

  it('normalises a dash note into parentheses (documented, and stable)', () => {
    expect(formatIngredient(parseIngredientLine('פלפל שחור - לפי הטעם'))).toBe(
      'פלפל שחור (לפי הטעם)'
    );
  });

  it('normalises the unit-first form to its explicit quantity (documented, and stable)', () => {
    expect(formatIngredient(parseIngredientLine('כוס וחצי קמח'))).toBe('1 וחצי כוס קמח');
  });

  it('formats a hand-built ingredient, omitting the missing parts', () => {
    expect(formatIngredient({ name: 'סוכר' })).toBe('סוכר');
    expect(formatIngredient({ quantity: 2, name: 'ביצים' })).toBe('2 ביצים');
    expect(formatIngredient({ quantity: 2.5, unit: 'כוסות', name: 'קמח' })).toBe('2.5 כוסות קמח');
    expect(formatIngredient({ name: 'בצל', note: 'קצוץ' })).toBe('בצל (קצוץ)');
  });
});

describe('quantityAsNumber', () => {
  const numberFor = (line: string): number | null => quantityAsNumber(parseIngredientLine(line));

  it('returns plain numerals as-is', () => {
    expect(numberFor('2 כפות סוכר')).toBe(2);
    expect(numberFor('1.5 כוס קמח')).toBe(1.5);
  });

  it('resolves fractions', () => {
    expect(numberFor('1/2 כוס סוכר')).toBe(0.5);
    expect(numberFor('½ כפית מלח')).toBe(0.5);
    expect(numberFor('¾ כוס חלב')).toBe(0.75);
    expect(numberFor('2 1/2 כוסות קמח')).toBe(2.5);
  });

  it('resolves the Hebrew word forms', () => {
    expect(numberFor('חצי כוס שמן')).toBe(0.5);
    expect(numberFor('רבע כפית קינמון')).toBe(0.25);
    expect(numberFor('2 וחצי כוסות קמח')).toBe(2.5);
    expect(numberFor('כוס וחצי קמח')).toBe(1.5);
    expect(numberFor('שליש כוס מים')).toBeCloseTo(1 / 3, 10);
  });

  it('returns null for a range rather than guessing a midpoint', () => {
    expect(numberFor('2-3 ביצים')).toBeNull();
  });

  it('returns null when there is no quantity at all', () => {
    expect(numberFor('מלח לפי הטעם')).toBeNull();
    expect(numberFor('70-80% קקאו')).toBeNull();
  });

  it('returns null for a hand-built quantity it cannot resolve', () => {
    const freeText: StructuredIngredient = { quantity: 'קצת', name: 'מלח' };
    expect(quantityAsNumber(freeText)).toBeNull();
    expect(quantityAsNumber({ name: 'מלח' })).toBeNull();
    expect(quantityAsNumber({ quantity: Number.NaN, name: 'מלח' })).toBeNull();
  });
});

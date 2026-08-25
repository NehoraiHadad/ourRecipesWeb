/**
 * Hebrew measurement vocabulary and the quantity grammar used by
 * `ingredientParser`. Split out so the parser module keeps only the
 * line-splitting logic and both stay inside the 150-line budget.
 */

/** Unicode vulgar fractions that show up in pasted/copied recipes. */
const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125
};

/** Hebrew fraction words that can stand alone as a quantity ("חצי כוס"). */
const HEBREW_FRACTIONS: Record<string, number> = {
  'שלושת רבעי': 0.75,
  'שני שליש': 2 / 3,
  'חצי': 0.5,
  'רבע': 0.25,
  'שליש': 1 / 3
};

/** Additive suffix forms: "2 וחצי" = 2.5, "כוס ורבע" = 1.25. */
const HEBREW_ADDITIVES: Record<string, number> = {
  'ושלושת רבעי': 0.75,
  'וחצי': 0.5,
  'ורבע': 0.25,
  'ושליש': 1 / 3
};

/**
 * Units are only ever recognised directly after a quantity (or in the
 * "כוס וחצי" unit-first form), so ambiguous words such as "שן" or "קורט"
 * cannot swallow the start of an ingredient name.
 */
export const HEBREW_UNITS: ReadonlySet<string> = new Set([
  'כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות',
  'גרם', "גר'", 'ק"ג', 'ק״ג', 'קילו', 'קילוגרם', 'מ"ג', 'מ״ג',
  'מ"ל', 'מ״ל', 'מיליליטר', 'ליטר', 'ליטרים',
  'יחידה', 'יחידות', 'חבילה', 'חבילות', 'קופסה', 'קופסאות', 'קופסת',
  'שקית', 'שקיות', 'פרוסה', 'פרוסות', 'שן', 'שיני', 'שיניים',
  'קורט', 'קורטים', 'מיכל', 'מיכלים', 'גביע', 'גביעים', 'אריזה', 'אריזות',
  'חופן', 'חופנים', 'צרור', 'צרורות', 'ענף', 'ענפים', 'טיפה', 'טיפות',
  'כדור', 'כדורים'
]);

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const VULGAR = `[${Object.keys(VULGAR_FRACTIONS).join('')}]`;
const FRACTION_WORDS = Object.keys(HEBREW_FRACTIONS).join('|');
export const ADDITIVE_WORDS = Object.keys(HEBREW_ADDITIVES).join('|');

/**
 * Ordered quantity forms. Every rule must end on a word boundary so that
 * "70-80% קקאו" (a cocoa percentage, part of the name) is never mistaken for
 * a quantity. Only the plain-number rule yields a numeric quantity — see
 * `parseIngredientLine` for the canonical-form rule.
 */
const QUANTITY_RULES: readonly { re: RegExp; numeric: boolean }[] = [
  { re: new RegExp(`^(${NUMBER}\\s*[-–]\\s*${NUMBER})(?!\\s*%)(?=\\s|$)`), numeric: false },
  { re: new RegExp(`^(${NUMBER}\\s+(?:${ADDITIVE_WORDS}))(?=\\s|$)`), numeric: false },
  { re: new RegExp(`^(${NUMBER}\\s+\\d+/\\d+)(?=\\s|$)`), numeric: false },
  { re: new RegExp(`^(\\d+/\\d+)(?=\\s|$)`), numeric: false },
  { re: new RegExp(`^(${NUMBER}\\s*${VULGAR})(?=\\s|$)`), numeric: false },
  { re: new RegExp(`^(${VULGAR})(?=\\s|$)`), numeric: false },
  { re: new RegExp(`^(${NUMBER})(?!\\s*[-–%])(?=\\s|$)`), numeric: true },
  { re: new RegExp(`^(${FRACTION_WORDS})(?=\\s|$)`), numeric: false }
];

export interface QuantityMatch {
  /** Numeric only for plain numerals; every other form keeps its literal text. */
  quantity: number | string;
  /** The rest of the line, trimmed. */
  rest: string;
}

/** Matches a leading quantity, or returns null when the line has none. */
export function matchQuantity(text: string): QuantityMatch | null {
  for (const { re, numeric } of QUANTITY_RULES) {
    const match = text.match(re);
    if (!match) continue;
    const token = match[1];
    return {
      quantity: numeric ? Number(token) : token,
      rest: text.slice(match[0].length).trim()
    };
  }
  return null;
}

/**
 * Derives the numeric value of a quantity, or null when it is not a single
 * value (ranges such as "2-3" are deliberately not averaged).
 */
export function quantityToNumber(quantity: number | string | undefined): number | null {
  if (typeof quantity === 'number') return Number.isFinite(quantity) ? quantity : null;
  if (typeof quantity !== 'string') return null;

  const text = quantity.trim();
  if (!text) return null;
  if (new RegExp(`^${NUMBER}$`).test(text)) return Number(text);

  const additive = text.match(new RegExp(`^(${NUMBER})\\s+(${ADDITIVE_WORDS})$`));
  if (additive) return Number(additive[1]) + HEBREW_ADDITIVES[additive[2]];

  const mixedFraction = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFraction) return Number(mixedFraction[1]) + Number(mixedFraction[2]) / Number(mixedFraction[3]);

  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);

  const vulgar = text.match(new RegExp(`^(${NUMBER})?\\s*(${VULGAR})$`));
  if (vulgar) return (vulgar[1] ? Number(vulgar[1]) : 0) + VULGAR_FRACTIONS[vulgar[2]];

  return HEBREW_FRACTIONS[text] ?? null;
}

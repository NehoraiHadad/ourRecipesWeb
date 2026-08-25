/**
 * Structured parsing of a single Hebrew ingredient line ("2 כפות סוכר").
 *
 * Canonical form (the rule that keeps `format`/`parse` round-trip stable):
 * `quantity` is a **number** only when the source wrote a plain numeral
 * ("2", "1.5"). Every other recognised form keeps its literal text as a
 * **string** — fractions ("1/2", "½"), Hebrew words ("חצי"), mixed forms
 * ("2 וחצי") and ranges ("2-3"). `formatIngredient` therefore replays exactly
 * what the cook wrote, and `quantityAsNumber` is the single place that turns
 * either representation into a number for the servings multiplier.
 *
 * The parser never throws and never drops words: anything it cannot classify
 * stays verbatim in `name`, so `formatIngredient(parseIngredientLine(line))`
 * reproduces the line (whitespace-normalised). Two documented normalisations:
 * a dash-introduced note ("בצל - קצוץ") comes back parenthesised, and the
 * unit-first form ("כוס וחצי קמח") comes back with its implied leading 1
 * ("1 וחצי כוס קמח"). Both are stable under a second round-trip.
 */

import {
  ADDITIVE_WORDS,
  HEBREW_UNITS,
  matchQuantity,
  quantityToNumber
} from '@/lib/recipes/ingredientLexicon';

export interface StructuredIngredient {
  quantity?: number | string;
  unit?: string;
  name: string;
  note?: string;
}

const PARENTHESISED_NOTE = /\(([^)]*)\)/g;
/** "בצל - קצוץ דק"; the digit guard keeps a spaced range ("2 - 3") intact. */
const DASH_NOTE = /\s[-–]\s+(?!\d)(.+)$/;
const UNIT_FIRST = new RegExp(`^(\\S+)\\s+(${ADDITIVE_WORDS})(?=\\s|$)`);

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Pulls notes out of the line, leaving the measurable part behind. */
function extractNote(line: string): { text: string; note?: string } {
  const notes: string[] = [];
  let text = normalize(
    line.replace(PARENTHESISED_NOTE, (_match, inner: string) => {
      const note = normalize(inner);
      if (note) notes.push(note);
      return ' ';
    })
  );

  if (notes.length === 0) {
    const dashNote = text.match(DASH_NOTE);
    if (dashNote) {
      notes.push(normalize(dashNote[1]));
      text = normalize(text.slice(0, dashNote.index));
    }
  }

  return notes.length > 0 ? { text, note: notes.join(', ') } : { text };
}

/** Splits "כוס סוכר" into unit + name; a leading non-unit word stays in name. */
function splitUnit(rest: string): { unit?: string; name: string } {
  const [first, ...others] = rest.split(' ');
  if (!HEBREW_UNITS.has(first)) return { name: rest };
  const name = others.join(' ');
  // "2 כוסות" — nothing to name, so the unit *is* what was measured.
  return name ? { unit: first, name } : { name: first };
}

/** "כוס וחצי קמח" — the unit comes first and the leading 1 is implied. */
function matchUnitFirst(text: string): StructuredIngredient | null {
  const match = text.match(UNIT_FIRST);
  if (!match || !HEBREW_UNITS.has(match[1])) return null;
  const name = text.slice(match[0].length).trim();
  return name ? { quantity: `1 ${match[2]}`, unit: match[1], name } : null;
}

/**
 * Parses one ingredient line into quantity / unit / name / note. Never
 * throws; an unrecognisable line comes back with everything in `name`.
 */
export function parseIngredientLine(line: string): StructuredIngredient {
  const source = normalize(line ?? '');
  if (!source) return { name: '' };

  const { text, note } = extractNote(source);
  const withNote = (ingredient: StructuredIngredient): StructuredIngredient =>
    note ? { ...ingredient, note } : ingredient;

  if (!text) return withNote({ name: '' });

  const quantity = matchQuantity(text);
  if (quantity && quantity.rest) {
    return withNote({ quantity: quantity.quantity, ...splitUnit(quantity.rest) });
  }

  return withNote(matchUnitFirst(text) ?? { name: text });
}

function formatQuantity(quantity: number | string): string {
  if (typeof quantity === 'string') return normalize(quantity);
  if (!Number.isFinite(quantity)) return '';
  return String(Math.round(quantity * 1000) / 1000);
}

/** Inverse of `parseIngredientLine` (see the canonical-form note above). */
export function formatIngredient(ingredient: StructuredIngredient): string {
  const parts: string[] = [];
  if (ingredient.quantity !== undefined && ingredient.quantity !== '') {
    parts.push(formatQuantity(ingredient.quantity));
  }
  if (ingredient.unit) parts.push(ingredient.unit);
  if (ingredient.name) parts.push(ingredient.name);

  const body = normalize(parts.join(' '));
  const note = ingredient.note ? normalize(ingredient.note) : '';
  if (!note) return body;
  return body ? `${body} (${note})` : `(${note})`;
}

/**
 * The numeric value of an ingredient's quantity, for the servings multiplier.
 * Returns null when there is no single honest number (missing quantity, a
 * range such as "2-3", or free text) — callers should then leave the
 * quantity untouched rather than guessing.
 */
export function quantityAsNumber(ingredient: StructuredIngredient): number | null {
  return quantityToNumber(ingredient.quantity);
}

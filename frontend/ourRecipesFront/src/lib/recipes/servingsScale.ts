/**
 * The servings multiplier (the 1X / 2X control) — the one place that scales a
 * structured ingredient's quantity.
 *
 * Rules (STRUCTURE_REFACTOR_TASKS.md §D1):
 *  - the numeric value comes from `quantityAsNumber`, the parser's own
 *    accessor; when it returns null (no quantity, a range such as "2-3", or
 *    free text) the quantity is displayed **unscaled, exactly as written** —
 *    guessing what half of "2-3 כפות" means is worse than showing the range.
 *  - a scaled value is rendered the way a cook writes it ("חצי", "1 וחצי"),
 *    falling back to a short decimal when there is no tidy Hebrew form.
 *
 * Pure and browser-safe: no React, no network, no Prisma.
 */

import {
  formatIngredient,
  quantityAsNumber,
  type StructuredIngredient
} from '@/lib/recipes/ingredientParser';

const EPSILON = 0.001;

/** Standalone fraction words, longest/most specific first. */
const FRACTION_WORDS: readonly [number, string][] = [
  [0.75, 'שלושת רבעי'],
  [2 / 3, 'שני שליש'],
  [0.5, 'חצי'],
  [1 / 3, 'שליש'],
  [0.25, 'רבע'],
  [0.125, 'שמינית']
];

/** Additive forms used after a whole number ("2 וחצי"). */
const ADDITIVE_WORDS: readonly [number, string][] = [
  [0.75, 'ושלושת רבעי'],
  [0.5, 'וחצי'],
  [1 / 3, 'ושליש'],
  [0.25, 'ורבע']
];

function findWord(words: readonly [number, string][], value: number): string | null {
  const match = words.find(([amount]) => Math.abs(amount - value) < EPSILON);
  return match ? match[1] : null;
}

/** A scaled number as a cook would write it: "2", "חצי", "1 וחצי", "0.33". */
export function formatScaledQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';

  const whole = Math.floor(value + EPSILON);
  const fraction = value - whole;

  if (fraction < EPSILON) return String(whole);
  if (whole === 0) return findWord(FRACTION_WORDS, fraction) ?? trimDecimal(value);

  const additive = findWord(ADDITIVE_WORDS, fraction);
  return additive ? `${whole} ${additive}` : trimDecimal(value);
}

function trimDecimal(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The same ingredient with its quantity multiplied. Unscalable quantities
 * (null from `quantityAsNumber`) come back untouched.
 */
export function scaleIngredient(
  ingredient: StructuredIngredient,
  multiplier: number
): StructuredIngredient {
  if (multiplier === 1) return ingredient;
  const numeric = quantityAsNumber(ingredient);
  if (numeric === null) return ingredient;
  return { ...ingredient, quantity: formatScaledQuantity(numeric * multiplier) };
}

export interface ScaledIngredient {
  /** Quantity + unit, the part the list highlights (may be empty). */
  measure: string;
  /** What is being measured. */
  name: string;
  note?: string;
  /** The whole line, for sharing / copying. */
  text: string;
}

/** Splits a scaled ingredient into the spans the ingredient list renders. */
export function scaleIngredientForDisplay(
  ingredient: StructuredIngredient,
  multiplier: number
): ScaledIngredient {
  const scaled = scaleIngredient(ingredient, multiplier);
  const quantity =
    typeof scaled.quantity === 'number'
      ? formatScaledQuantity(scaled.quantity)
      : (scaled.quantity ?? '').trim();

  return {
    measure: [quantity, scaled.unit].filter(Boolean).join(' '),
    name: scaled.name,
    note: scaled.note,
    text: formatIngredient(scaled)
  };
}

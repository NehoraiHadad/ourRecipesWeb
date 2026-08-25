/**
 * Per-line field extraction for `parseRecipeMessage`. Each helper reads one
 * labelled line, pushes any Hebrew validation message onto `errors`, and
 * returns `undefined` when the line was invalid — in which case the caller
 * keeps whatever a previous line already produced (the Python original,
 * `Recipe._parse_content`, behaves the same way: it only ever assigns on the
 * valid branch).
 */

import {
  DIFFICULTY_HE_TO_ENUM,
  LABEL_CATEGORIES,
  LABEL_DIFFICULTY,
  LABEL_PREP_TIME,
  type RecipeDifficultyValue
} from '@/lib/recipes/parserLabels';

const MAX_PREP_MINUTES = 1440;
const MAX_CATEGORIES = 5;

/** `זמן הכנה: 45 דקות` → 45. The first number on the line wins. */
export function parsePrepTimeLine(part: string, errors: string[]): number | undefined {
  const timeStr = part.split(LABEL_PREP_TIME).join('').trim();
  const numbers = timeStr.match(/\d+/g);
  if (!numbers || numbers.length === 0) {
    errors.push('זמן הכנה לא תקין - חסר מספר');
    return undefined;
  }

  const timeValue = parseInt(numbers[0], 10);
  if (timeValue <= 0 || timeValue > MAX_PREP_MINUTES) {
    errors.push(`זמן הכנה חייב להיות בין 1 ל-${MAX_PREP_MINUTES} דקות`);
    return undefined;
  }
  return timeValue;
}

/** `רמת קושי: קל` → 'EASY'. */
export function parseDifficultyLine(
  part: string,
  errors: string[]
): RecipeDifficultyValue | undefined {
  const difficultyStr = part.split(LABEL_DIFFICULTY).join('').trim().toLowerCase();
  const mapped = DIFFICULTY_HE_TO_ENUM[difficultyStr];
  if (!mapped) {
    errors.push(`רמת קושי לא תקינה: ${difficultyStr}`);
    return undefined;
  }
  return mapped;
}

/**
 * `קטגוריות: עוגות, קינוחים` → ['עוגות', 'קינוחים']. More than five
 * supplied: keep the first five rather than dropping all of them (the Python
 * behavior this was ported from silently discarded every category once the
 * limit was exceeded — a real bug, not a deliberate cap).
 */
export function parseCategoriesLine(part: string, errors: string[]): string[] | undefined {
  const rawCategories = part.split(LABEL_CATEGORIES).join('').split(',');
  const newCategories = rawCategories.map((c) => c.trim()).filter((c) => c);
  if (newCategories.length === 0) {
    errors.push('לא נמצאו קטגוריות תקינות');
    return undefined;
  }
  return newCategories.slice(0, MAX_CATEGORIES);
}

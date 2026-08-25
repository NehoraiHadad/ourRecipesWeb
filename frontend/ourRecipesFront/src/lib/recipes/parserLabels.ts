/**
 * The literal section markers the bot / AI service writes into channel
 * messages, plus the difficulty vocabulary. Extracted from `parser.ts` so
 * that module holds only parsing logic; the deliberate deviations from the
 * Python source are documented here, next to the values they affect.
 */

/** Matches the Prisma `RecipeDifficulty` enum (schema.prisma). */
export type RecipeDifficultyValue = 'EASY' | 'MEDIUM' | 'HARD';

export const LABEL_TITLE = 'כותרת:';
export const LABEL_PREP_TIME = 'זמן הכנה:';
export const LABEL_DIFFICULTY = 'רמת קושי:';
export const LABEL_CATEGORIES = 'קטגוריות:';
/**
 * Canonical ingredients label, still the only one `formatRecipeText` emits.
 * Real channel messages (including the old backend's own test fixtures,
 * backend/tests/test_categories.py) also use the shorter "מצרכים:" or
 * "רכיבים:" — accepted as synonyms so those messages don't lose their
 * ingredients section.
 */
export const LABEL_INGREDIENTS = 'רשימת מצרכים:';
export const INGREDIENTS_LABELS = [LABEL_INGREDIENTS, 'מצרכים:', 'רכיבים:'];
export const LABEL_INSTRUCTIONS = 'הוראות הכנה:';

/**
 * `Recipe._parse_content`'s `difficulty_map` (Python dict), extended beyond
 * the literal Python source: the AI service's own prompts (ai_service.py)
 * and the client-side formatter ask the model for "מורכב" for HARD, not
 * "קשה" — a real mismatch (not a deliberate quirk) that silently dropped
 * every AI-authored "hard" recipe's difficulty. Both spellings map to HARD.
 */
export const DIFFICULTY_HE_TO_ENUM: Record<string, RecipeDifficultyValue> = {
  'קל': 'EASY',
  'בינוני': 'MEDIUM',
  'קשה': 'HARD',
  'מורכב': 'HARD'
};

export const DIFFICULTY_ENUM_TO_HE: Record<RecipeDifficultyValue, string> = {
  EASY: 'קל',
  MEDIUM: 'בינוני',
  HARD: 'קשה'
};

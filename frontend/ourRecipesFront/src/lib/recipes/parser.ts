/**
 * Recipe message parsing / formatting.
 *
 * This is a port of the Python parsing logic used by the Flask backend, so
 * that the webhook handler and recipes API routes can extract structured
 * fields from a raw Telegram channel message the same way the old backend
 * did. Hebrew is the base case (the labels below are the literal section
 * markers the bot/AI service writes into channel messages). A handful of
 * spots deliberately deviate from the literal Python source where that
 * source lost real-world data rather than encoding an intentional rule: see
 * the `INGREDIENTS_LABELS`, `DIFFICULTY_HE_TO_ENUM`, and category-truncation
 * comments below for each case and why.
 *
 * Ported from:
 *  - backend/ourRecipesBack/services/recipe_service.py
 *      `RecipeService.get_first_line`, `RecipeService.get_details`
 *  - backend/ourRecipesBack/models/recipe.py
 *      `Recipe._parse_content` (the canonical, field-by-field parser that
 *      actually populates title/categories/ingredients/instructions/
 *      preparation_time/difficulty when a recipe is saved)
 *  - backend/ourRecipesBack/utils/formatters.py
 *      `format_recipe_text` (the canonical inverse formatter). Note: that
 *      Python function is not wired into any route (routes/recipes.py just
 *      forwards whatever `newText` the client already sent) and only covers
 *      title/categories/ingredients/instructions. `formatRecipeText` below
 *      ports it 1:1 for those four fields and additionally emits the
 *      `זמן הכנה:` / `רמת קושי:` lines that `Recipe._parse_content` (and the
 *      AI service prompts) recognize, so the output round-trips through
 *      `parseRecipeMessage` for every field `ParsedRecipe` carries. This
 *      extension is called out explicitly since it goes beyond the literal
 *      Python source.
 */

/** Matches the Prisma `RecipeDifficulty` enum (schema.prisma). */
export type RecipeDifficultyValue = 'EASY' | 'MEDIUM' | 'HARD';

export interface ParsedRecipe {
  title: string;
  categories: string[];
  ingredients: string[];
  instructions: string;
  preparationTime?: number;
  difficulty?: RecipeDifficultyValue;
  /** Original, unmodified message text. */
  raw: string;
  /**
   * Mirrors `Recipe.is_parsed` / `Recipe.parse_errors` from the Python model:
   * true only when every expected section was found and valid. A recipe
   * message is still fully extracted (best-effort) even when this is false.
   */
  isParsed: boolean;
  parseErrors: string[];
}

// Section / field labels used verbatim by the Telegram channel format.
const LABEL_TITLE = 'כותרת:';
const LABEL_PREP_TIME = 'זמן הכנה:';
const LABEL_DIFFICULTY = 'רמת קושי:';
const LABEL_CATEGORIES = 'קטגוריות:';
// Canonical label, still the only one `formatRecipeText` emits. Real channel
// messages (including the old backend's own test fixtures,
// backend/tests/test_categories.py) also use the shorter "מצרכים:" or
// "רכיבים:" — accepted as synonyms so those messages don't lose their
// ingredients section.
const LABEL_INGREDIENTS = 'רשימת מצרכים:';
const INGREDIENTS_LABELS = [LABEL_INGREDIENTS, 'מצרכים:', 'רכיבים:'];
const LABEL_INSTRUCTIONS = 'הוראות הכנה:';

// `Recipe._parse_content`'s `difficulty_map` (Python dict), extended beyond
// the literal Python source: the AI service's own prompts (ai_service.py)
// and the client-side formatter ask the model for "מורכב" for HARD, not
// "קשה" — a real mismatch (not a deliberate quirk) that silently dropped
// every AI-authored "hard" recipe's difficulty. Both spellings map to HARD.
const DIFFICULTY_HE_TO_ENUM: Record<string, RecipeDifficultyValue> = {
  'קל': 'EASY',
  'בינוני': 'MEDIUM',
  'קשה': 'HARD',
  'מורכב': 'HARD'
};

const DIFFICULTY_ENUM_TO_HE: Record<RecipeDifficultyValue, string> = {
  EASY: 'קל',
  MEDIUM: 'בינוני',
  HARD: 'קשה'
};

/**
 * Strip any leading/trailing characters that appear in `chars`, matching
 * Python's `str.strip(chars)` (which strips a *set* of characters, not a
 * literal prefix/suffix).
 */
function pyStrip(value: string, chars: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && chars.includes(value[start])) start++;
  while (end > start && chars.includes(value[end - 1])) end--;
  return value.slice(start, end);
}

/** Python's `str.lstrip(chars)` — strips a set of characters from the left only. */
function pyLStrip(value: string, chars: string): string {
  let start = 0;
  while (start < value.length && chars.includes(value[start])) start++;
  return value.slice(start);
}

/**
 * Port of `RecipeService.get_first_line`:
 * `text.split("\n", 1)[0].strip("*:")`
 */
export function getFirstLine(text: string): string {
  if (!text) return '';
  const firstLine = text.split('\n')[0];
  return pyStrip(firstLine, '*:');
}

/**
 * Port of `RecipeService.get_details`: everything after the first line.
 * Python uses `str.splitlines()`; this uses a plain `\n` split, which is
 * equivalent for the `\n`-only Telegram message bodies this operates on.
 */
export function getDetails(text: string): string {
  if (!text) return '';
  const parts = text.split('\n');
  return parts.length > 1 ? parts.slice(1).join('\n') : '';
}

/**
 * Port of `Recipe._parse_content` (models/recipe.py). Parses a raw recipe
 * message into structured fields, matching field-for-field and
 * error-for-error what the Python model does when a recipe's content is
 * saved.
 */
export function parseRecipeMessage(text: string): ParsedRecipe {
  const raw = text ?? '';
  const parseErrors: string[] = [];

  if (!raw.trim()) {
    return {
      title: '',
      categories: [],
      ingredients: [],
      instructions: '',
      preparationTime: undefined,
      difficulty: undefined,
      raw,
      isParsed: false,
      parseErrors: ['תוכן המתכון ריק']
    };
  }

  const recipeParts = raw.split('\n');

  let preparationTime: number | undefined;
  let difficulty: RecipeDifficultyValue | undefined;
  let categories: string[] = [];
  const tempIngredients: string[] = [];
  const tempInstructions: string[] = [];

  // Parse title (first line)
  let title: string;
  if (!recipeParts[0].startsWith(LABEL_TITLE)) {
    parseErrors.push('חסרה כותרת מתכון');
    title = recipeParts[0].trim();
  } else {
    title = recipeParts[0].split(LABEL_TITLE).join('').trim();
    if (!title) {
      parseErrors.push('כותרת המתכון ריקה');
    }
  }

  let currentSection: 'ingredients' | 'instructions' | null = null;

  for (const rawPart of recipeParts) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part.startsWith(LABEL_PREP_TIME)) {
      const timeStr = part.split(LABEL_PREP_TIME).join('').trim();
      const numbers = timeStr.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const timeValue = parseInt(numbers[0], 10);
        if (timeValue <= 0 || timeValue > 1440) {
          parseErrors.push('זמן הכנה חייב להיות בין 1 ל-1440 דקות');
        } else {
          preparationTime = timeValue;
        }
      } else {
        parseErrors.push('זמן הכנה לא תקין - חסר מספר');
      }
    } else if (part.startsWith(LABEL_DIFFICULTY)) {
      const difficultyStr = part.split(LABEL_DIFFICULTY).join('').trim().toLowerCase();
      const mapped = DIFFICULTY_HE_TO_ENUM[difficultyStr];
      if (!mapped) {
        parseErrors.push(`רמת קושי לא תקינה: ${difficultyStr}`);
      } else {
        difficulty = mapped;
      }
    } else if (part.startsWith(LABEL_CATEGORIES)) {
      const rawCategories = part.split(LABEL_CATEGORIES).join('').split(',');
      const newCategories = rawCategories.map((c) => c.trim()).filter((c) => c);
      if (newCategories.length === 0) {
        parseErrors.push('לא נמצאו קטגוריות תקינות');
      } else {
        // More than 5 supplied: keep the first 5 rather than dropping all of
        // them (the Python behavior this was ported from silently discarded
        // every category once the limit was exceeded — a real bug, not a
        // deliberate cap).
        categories = newCategories.slice(0, 5);
      }
    } else if (INGREDIENTS_LABELS.some((label) => part.startsWith(label))) {
      currentSection = 'ingredients';
    } else if (currentSection === 'ingredients' && part.startsWith('-')) {
      const ingredient = pyLStrip(part, '- ').trim();
      if (ingredient) {
        tempIngredients.push(ingredient);
      }
    } else if (part.startsWith(LABEL_INSTRUCTIONS)) {
      currentSection = 'instructions';
    } else if (currentSection === 'instructions') {
      if (part !== LABEL_INSTRUCTIONS && part) {
        const instruction = part.trim();
        if (instruction) {
          tempInstructions.push(instruction);
        }
      }
    }
  }

  const ingredients = tempIngredients;
  const instructions = tempInstructions.join('\n');

  if (ingredients.length === 0) parseErrors.push('לא נמצאו מצרכים');
  if (!instructions) parseErrors.push('לא נמצאו הוראות הכנה');
  if (categories.length === 0) parseErrors.push('לא נמצאו קטגוריות');
  if (!preparationTime) parseErrors.push('לא צוין זמן הכנה');
  if (!difficulty) parseErrors.push('לא צוינה רמת קושי');

  return {
    title,
    categories,
    ingredients,
    instructions,
    preparationTime,
    difficulty,
    raw,
    isParsed: parseErrors.length === 0,
    parseErrors
  };
}

export interface FormatRecipeInput {
  title: string;
  categories?: string[];
  ingredients?: string[];
  instructions?: string;
  preparationTime?: number;
  difficulty?: RecipeDifficultyValue;
}

/**
 * Port of `format_recipe_text` (utils/formatters.py), producing the same
 * canonical channel message text: `כותרת:` / `קטגוריות:` / `רשימת מצרכים:`
 * (`-` bulleted) / `הוראות הכנה:`. Also emits `זמן הכנה:` and `רמת קושי:`
 * lines when those fields are present, so the result round-trips through
 * `parseRecipeMessage` — see the module docstring for why this goes beyond
 * the literal (unused, 4-field-only) Python function.
 */
export function formatRecipeText(parsed: FormatRecipeInput): string {
  const categoriesStr = parsed.categories && parsed.categories.length > 0
    ? parsed.categories.join(', ')
    : '';
  const ingredientsStr = (parsed.ingredients ?? [])
    .map((ingredient) => `- ${ingredient}`)
    .join('\n');

  const lines = [
    `${LABEL_TITLE} ${parsed.title}`,
    `${LABEL_CATEGORIES} ${categoriesStr}`
  ];

  if (parsed.preparationTime !== undefined) {
    lines.push(`${LABEL_PREP_TIME} ${parsed.preparationTime} דקות`);
  }
  if (parsed.difficulty !== undefined) {
    lines.push(`${LABEL_DIFFICULTY} ${DIFFICULTY_ENUM_TO_HE[parsed.difficulty]}`);
  }

  lines.push(LABEL_INGREDIENTS, ingredientsStr, LABEL_INSTRUCTIONS, parsed.instructions ?? '');

  return lines.join('\n');
}

/**
 * Port of `format_recipe_text` (backend/ourRecipesBack/utils/formatters.py),
 * the canonical inverse of `parseRecipeMessage`.
 *
 * The Python original is not wired into any route (routes/recipes.py just
 * forwards whatever `newText` the client already sent) and only covers
 * title/categories/ingredients/instructions. This port keeps those four
 * fields 1:1 and additionally emits the `זמן הכנה:` / `רמת קושי:` lines that
 * `Recipe._parse_content` (and the AI service prompts) recognise, so the
 * output round-trips through `parseRecipeMessage` for every field
 * `ParsedRecipe` carries.
 */

import {
  DIFFICULTY_ENUM_TO_HE,
  LABEL_CATEGORIES,
  LABEL_DIFFICULTY,
  LABEL_INGREDIENTS,
  LABEL_INSTRUCTIONS,
  LABEL_PREP_TIME,
  LABEL_TITLE,
  type RecipeDifficultyValue
} from '@/lib/recipes/parserLabels';

export interface FormatRecipeInput {
  title: string;
  categories?: string[];
  ingredients?: string[];
  instructions?: string;
  preparationTime?: number;
  difficulty?: RecipeDifficultyValue;
}

/**
 * Builds the canonical channel message: `כותרת:` / `קטגוריות:` /
 * `רשימת מצרכים:` (`-` bulleted) / `הוראות הכנה:`, with the optional
 * preparation-time and difficulty lines in between.
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

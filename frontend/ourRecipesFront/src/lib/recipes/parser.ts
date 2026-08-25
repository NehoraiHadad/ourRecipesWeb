/**
 * Recipe message parsing — the single, server-side source of truth for
 * turning a raw Telegram channel message into structured recipe fields.
 *
 * Ported from the Flask backend's `Recipe._parse_content`
 * (backend/ourRecipesBack/models/recipe.py), field-for-field and
 * error-for-error. A couple of spots deliberately deviate from the literal
 * Python source where that source lost real-world data rather than encoding
 * an intentional rule — see `parserLabels.ts` and `parserFields.ts` for each
 * case and why.
 *
 * This module stays the public entry point: the labels, the text helpers,
 * the inverse formatter and the ingredient-line parser live in sibling
 * modules and are re-exported here.
 */

import { parseIngredientLine, type StructuredIngredient } from '@/lib/recipes/ingredientParser';
import { pyLStrip } from '@/lib/recipes/messageText';
import { parseCategoriesLine, parseDifficultyLine, parsePrepTimeLine } from '@/lib/recipes/parserFields';
import {
  INGREDIENTS_LABELS,
  LABEL_CATEGORIES,
  LABEL_DIFFICULTY,
  LABEL_INSTRUCTIONS,
  LABEL_PREP_TIME,
  LABEL_TITLE,
  type RecipeDifficultyValue
} from '@/lib/recipes/parserLabels';

export { getFirstLine, getDetails } from '@/lib/recipes/messageText';
export { formatRecipeText, type FormatRecipeInput } from '@/lib/recipes/recipeFormatter';
export { formatIngredient, parseIngredientLine, quantityAsNumber } from '@/lib/recipes/ingredientParser';
export type { StructuredIngredient } from '@/lib/recipes/ingredientParser';
export type { RecipeDifficultyValue } from '@/lib/recipes/parserLabels';

export interface ParsedRecipe {
  title: string;
  categories: string[];
  /** The ingredient lines exactly as written in the channel message. */
  ingredients: string[];
  /** The same lines split into quantity / unit / name / note. */
  structuredIngredients: StructuredIngredient[];
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

function emptyRecipe(raw: string): ParsedRecipe {
  return {
    title: '',
    categories: [],
    ingredients: [],
    structuredIngredients: [],
    instructions: '',
    preparationTime: undefined,
    difficulty: undefined,
    raw,
    isParsed: false,
    parseErrors: ['תוכן המתכון ריק']
  };
}

/** Parses a raw recipe message into structured fields. */
export function parseRecipeMessage(text: string): ParsedRecipe {
  const raw = text ?? '';
  if (!raw.trim()) return emptyRecipe(raw);

  const parseErrors: string[] = [];
  const recipeParts = raw.split('\n');

  let preparationTime: number | undefined;
  let difficulty: RecipeDifficultyValue | undefined;
  let categories: string[] = [];
  const ingredients: string[] = [];
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
      preparationTime = parsePrepTimeLine(part, parseErrors) ?? preparationTime;
    } else if (part.startsWith(LABEL_DIFFICULTY)) {
      difficulty = parseDifficultyLine(part, parseErrors) ?? difficulty;
    } else if (part.startsWith(LABEL_CATEGORIES)) {
      categories = parseCategoriesLine(part, parseErrors) ?? categories;
    } else if (INGREDIENTS_LABELS.some((label) => part.startsWith(label))) {
      currentSection = 'ingredients';
    } else if (currentSection === 'ingredients' && part.startsWith('-')) {
      const ingredient = pyLStrip(part, '- ').trim();
      if (ingredient) {
        ingredients.push(ingredient);
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
    structuredIngredients: ingredients.map((line) => parseIngredientLine(line)),
    instructions,
    preparationTime,
    difficulty,
    raw,
    isParsed: parseErrors.length === 0,
    parseErrors
  };
}

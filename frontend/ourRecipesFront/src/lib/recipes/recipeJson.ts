/**
 * The structured contract for AI-authored recipes (JSON-first flow).
 *
 * Every model that writes a recipe (suggest / reformat / refine) is forced
 * onto `RECIPE_JSON_SCHEMA` via structured output — no free text, no parsing
 * guesswork. The canonical channel message is then *derived* from the JSON
 * with `formatRecipeText` (the parser's inverse), so an AI-authored recipe
 * always round-trips through `parseRecipeMessage` fully parsed.
 *
 * `parseRecipeMessage` remains the ingestion path for human-written channel
 * messages; this module is its structured twin for the AI direction.
 */
import { Type, type Schema } from '@google/genai';
import { formatRecipeText } from '@/lib/recipes/recipeFormatter';
import {
  DIFFICULTY_HE_TO_ENUM,
  LABEL_TIPS,
  type RecipeDifficultyValue
} from '@/lib/recipes/parserLabels';

const MAX_CATEGORIES = 5;

export interface RecipeJson {
  title: string;
  categories: string[];
  ingredients: string[];
  instructions: string[];
  preparationTime?: number;
  difficulty?: RecipeDifficultyValue;
  tips: string[];
}

export const RECIPE_JSON_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Recipe name in Hebrew, no emoji.' },
    categories: {
      type: Type.ARRAY,
      description: 'One to five Hebrew categories, e.g. "מנות עיקריות", "צמחוני".',
      items: { type: Type.STRING }
    },
    preparation_time: {
      type: Type.INTEGER,
      description: 'Total preparation time in minutes.'
    },
    difficulty: {
      type: Type.STRING,
      description: 'One of: קל, בינוני, מורכב.',
      enum: ['קל', 'בינוני', 'מורכב']
    },
    ingredients: {
      type: Type.ARRAY,
      description: 'One ingredient per item: quantity, unit and name in Hebrew, e.g. "2 כוסות קמח".',
      items: { type: Type.STRING }
    },
    instructions: {
      type: Type.ARRAY,
      description: 'Preparation steps in order, Hebrew, WITHOUT numbering prefixes.',
      items: { type: Type.STRING }
    },
    tips: {
      type: Type.ARRAY,
      description: 'Optional short Hebrew tips.',
      items: { type: Type.STRING }
    }
  },
  required: ['title', 'categories', 'preparation_time', 'difficulty', 'ingredients', 'instructions']
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Models sometimes number steps anyway ("1. ...") — numbering is ours to add. */
function stripStepNumbering(step: string): string {
  return step.replace(/^\d+\s*[.)]\s*/, '');
}

/**
 * Validates and normalizes a model's JSON answer. Returns `null` when the
 * essentials (title, ingredients, instructions) are missing — the caller
 * treats that as a failed generation, not a rendering problem.
 */
export function parseRecipeJson(text: string): RecipeJson | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const ingredients = asStringList(record.ingredients);
  const instructions = asStringList(record.instructions).map(stripStepNumbering);
  if (!title || ingredients.length === 0 || instructions.length === 0) return null;

  const preparationTime =
    typeof record.preparation_time === 'number' && Number.isFinite(record.preparation_time)
      ? Math.max(1, Math.round(record.preparation_time))
      : undefined;
  const difficulty =
    typeof record.difficulty === 'string'
      ? DIFFICULTY_HE_TO_ENUM[record.difficulty.trim()]
      : undefined;

  return {
    title,
    categories: asStringList(record.categories).slice(0, MAX_CATEGORIES),
    ingredients,
    instructions,
    preparationTime,
    difficulty,
    tips: asStringList(record.tips)
  };
}

/**
 * The canonical channel message for an AI-authored recipe: `formatRecipeText`
 * over the structured fields (numbered steps), plus a trailing tips section —
 * which `parseRecipeMessage` deliberately keeps out of `instructions`.
 */
export function recipeJsonToChannelText(recipe: RecipeJson): string {
  const text = formatRecipeText({
    title: recipe.title,
    categories: recipe.categories,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    preparationTime: recipe.preparationTime,
    difficulty: recipe.difficulty
  });

  if (recipe.tips.length === 0) return text;
  return `${text}\n\n${LABEL_TIPS}\n${recipe.tips.map((tip) => `- ${tip}`).join('\n')}`;
}

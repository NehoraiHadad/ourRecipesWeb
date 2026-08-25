/**
 * Structured-output contract for the final `MenuPlan`.
 *
 * Same arrangement as `src/lib/recipes/optimizedSteps.ts`: the Gemini
 * `responseSchema` and the runtime validator live side by side so the model
 * contract and the server-side check cannot drift. Nothing in this path parses
 * JSON out of prose — the plan arrives as `application/json` or not at all.
 */
import { Type, type Schema } from '@google/genai';
import type { MealPlan, MenuPlan, PlannedRecipe } from './types';

export const MENU_PLAN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    meals: {
      type: Type.ARRAY,
      description: 'The meals of the menu, in serving order.',
      items: {
        type: Type.OBJECT,
        properties: {
          meal_type: {
            type: Type.STRING,
            description: 'Hebrew meal name exactly as requested, e.g. "ארוחת ערב".'
          },
          meal_order: { type: Type.INTEGER, description: 'Serving order, starting at 1.' },
          recipes: {
            type: Type.ARRAY,
            description: 'Courses of this meal.',
            items: {
              type: Type.OBJECT,
              properties: {
                recipe_id: {
                  type: Type.INTEGER,
                  description: 'Id of an existing recipe returned by the tools.'
                },
                course_type: {
                  type: Type.STRING,
                  description: 'Hebrew course name: ראשונה / עיקרית / תוספת / קינוח.'
                },
                course_order: { type: Type.INTEGER, description: 'Order inside the meal, from 1.' },
                ai_reason: {
                  type: Type.STRING,
                  description: 'One Hebrew sentence: why this dish fits here.'
                }
              },
              required: ['recipe_id', 'course_type', 'course_order', 'ai_reason'],
              propertyOrdering: ['recipe_id', 'course_type', 'course_order', 'ai_reason']
            }
          }
        },
        required: ['meal_type', 'meal_order', 'recipes'],
        propertyOrdering: ['meal_type', 'meal_order', 'recipes']
      }
    },
    reasoning: {
      type: Type.STRING,
      description: 'Short Hebrew explanation of the menu as a whole.'
    }
  },
  required: ['meals', 'reasoning'],
  propertyOrdering: ['meals', 'reasoning']
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Models answer `"12"` for INTEGER fields often enough to be worth coercing. */
function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function parseRecipe(value: unknown, index: number): PlannedRecipe | null {
  if (!isRecord(value)) return null;

  const recipeId = asInteger(value.recipe_id);
  const aiReason = asNonEmptyString(value.ai_reason);
  if (recipeId === null || recipeId <= 0 || aiReason === null) return null;

  return {
    recipe_id: recipeId,
    course_type: asNonEmptyString(value.course_type) ?? 'עיקרית',
    course_order: asInteger(value.course_order) ?? index + 1,
    ai_reason: aiReason
  };
}

function parseMeal(value: unknown, index: number): MealPlan | null {
  if (!isRecord(value)) return null;

  const mealType = asNonEmptyString(value.meal_type);
  if (mealType === null || !Array.isArray(value.recipes) || value.recipes.length === 0) return null;

  const recipes: PlannedRecipe[] = [];
  for (let recipeIndex = 0; recipeIndex < value.recipes.length; recipeIndex++) {
    const recipe = parseRecipe(value.recipes[recipeIndex], recipeIndex);
    if (recipe === null) return null;
    recipes.push(recipe);
  }

  return { meal_type: mealType, meal_order: asInteger(value.meal_order) ?? index + 1, recipes };
}

/**
 * Validate a model answer. Returns `null` — never a half-filled plan — so the
 * caller turns non-conformance into a clean error instead of saving garbage.
 */
export function parseMenuPlan(value: unknown): MenuPlan | null {
  if (!isRecord(value) || !Array.isArray(value.meals) || value.meals.length === 0) return null;

  const meals: MealPlan[] = [];
  for (let index = 0; index < value.meals.length; index++) {
    const meal = parseMeal(value.meals[index], index);
    if (meal === null) return null;
    meals.push(meal);
  }

  return { meals, reasoning: asNonEmptyString(value.reasoning) ?? '' };
}

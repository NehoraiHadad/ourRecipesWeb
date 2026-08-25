/**
 * Tool surface offered to the menu agent.
 *
 * The pre-rewrite version handed the model a dump of up to 200 recipes and
 * hoped it would read them. These three tools let it *work* instead: narrow
 * the field in SQL, pull detail only for the shortlist, and get deterministic
 * criticism of a draft before committing to it.
 */
import { Type, type FunctionDeclaration } from '@google/genai';

/** Hard ceilings, enforced again in the executors — the model may ask for more. */
export const MAX_SEARCH_LIMIT = 40;
export const DEFAULT_SEARCH_LIMIT = 12;
export const MAX_DETAIL_IDS = 25;

export const MENU_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_recipes',
    description:
      'Search the recipe database. Filters run in SQL, so call it once per meal or per course ' +
      'with a focused query instead of asking for everything. Returns compact rows only.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'Free-text Hebrew terms matched against title and categories. ' +
            'Words are AND-ed, so keep it to one or two ("סלט", "עוף תנור").'
        },
        categories: {
          type: Type.ARRAY,
          description: 'Category names; a recipe matching any of them is returned.',
          items: { type: Type.STRING }
        },
        max_total_time: {
          type: Type.INTEGER,
          description: 'Upper bound on preparation + cooking time, in minutes.'
        },
        difficulty: {
          type: Type.STRING,
          description: 'One of EASY, MEDIUM, HARD.'
        },
        limit: {
          type: Type.INTEGER,
          description: `How many rows to return (default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT}).`
        }
      }
    }
  },
  {
    name: 'get_recipes_details',
    description:
      'Fetch ingredient names and an instructions preview for a shortlist of recipes, ' +
      'so you can tell whether two dishes clash or repeat. Ask only for candidates you are ' +
      'seriously considering.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipe_ids: {
          type: Type.ARRAY,
          description: `Recipe ids from search_recipes (max ${MAX_DETAIL_IDS}).`,
          items: { type: Type.INTEGER }
        }
      },
      required: ['recipe_ids']
    }
  },
  {
    name: 'review_menu_draft',
    description:
      'Check a draft menu before finishing: verifies every recipe exists and is active, ' +
      'that each meal has a main course, that no recipe repeats, and that courses in the same ' +
      'meal do not lean on the same ingredients. Returns issues in Hebrew — fix them and re-check.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        meals: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              meal_type: { type: Type.STRING, description: 'Hebrew meal name.' },
              recipes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    recipe_id: { type: Type.INTEGER },
                    course_type: { type: Type.STRING, description: 'Hebrew course name.' }
                  },
                  required: ['recipe_id', 'course_type']
                }
              }
            },
            required: ['meal_type', 'recipes']
          }
        }
      },
      required: ['meals']
    }
  }
];

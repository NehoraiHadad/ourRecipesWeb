/**
 * Hebrew prompt templates for the AI text tasks.
 *
 * suggest / reformat / refine are JSON-first (2026-08-26): the response shape
 * is enforced by `RECIPE_JSON_SCHEMA` via structured output, so these prompts
 * only carry the culinary instructions — no output-format contortions, no
 * "don't use Markdown" rules. The channel text is derived from the JSON by
 * `recipeJsonToChannelText`, never written by the model.
 */

export interface RecipeSuggestionParams {
  ingredients?: string;
  mealType?: string[];
  quickPrep?: boolean;
  childFriendly?: boolean;
  additionalRequests?: string;
}

/**
 * The suggestion form sends `mealType` as one string; the prompt builders
 * expect an array. Accept both shapes at the API boundary and drop anything
 * that is not a non-empty string.
 */
export function normalizeMealTypes(value: unknown): string[] | undefined {
  const items = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
  return items.length > 0 ? items : undefined;
}

const RECIPE_JSON_RULES = `כללים:
- כל הטקסט בעברית.
- ingredients: פריט אחד לכל רכיב, עם כמות ויחידה (למשל "2 כוסות קמח").
- instructions: שלב אחד לכל פריט, בלי מספור בתחילת השלב.
- categories: 1–5 קטגוריות קצרות שמתארות את המתכון.`;

export function buildSuggestionPrompt(params: RecipeSuggestionParams): string {
  const requestLines = [
    params.ingredients ? `רכיבים זמינים: ${params.ingredients}` : '',
    params.mealType?.length ? `סוג ארוחה: ${params.mealType.join(', ')}` : '',
    params.quickPrep ? 'דרישה: הכנה מהירה (עד 30 דקות)' : '',
    params.childFriendly ? 'דרישה: ידידותי לילדים' : '',
    params.additionalRequests ? `בקשות נוספות: ${params.additionalRequests}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  return `אתה עוזר מטבח מומחה. צור מתכון מפורט וחדש על בסיס הבקשה הבאה:

${requestLines || 'מתכון ביתי טעים, לבחירתך.'}

${RECIPE_JSON_RULES}`;
}

export function buildReformatPrompt(text: string): string {
  return `סדר את המתכון שבין המפרידים <recipe> למבנה הנדרש.

<recipe>
${text}
</recipe>

${RECIPE_JSON_RULES}
- אל תוסיף מידע שלא מופיע במתכון המקורי; שמור על ניסוח ההוראות המקורי ככל האפשר.
- אם ערך לא מופיע במקור (למשל זמן הכנה) — הערך אותו לפי תוכן המתכון.`;
}

export function buildRefinePrompt(recipeText: string, refinementRequest: string): string {
  return `שפר את המתכון שבין המפרידים <recipe> על פי הבקשה שבין המפרידים <request>, והחזר את המתכון המלא המעודכן.

<recipe>
${recipeText}
</recipe>

<request>
${refinementRequest}
</request>

${RECIPE_JSON_RULES}
- שמור על תוכן המתכון המקורי ככל האפשר; בצע רק את השינוי המבוקש.`;
}

export function buildOptimizeStepsPrompt(recipeText: string): string {
  return `
נתח את המתכון הבא והציע אופטימיזציה של השלבים:

${recipeText}

התמקד ב:
1. סדר יעיל של השלבים
2. הכנות מקבילות (מה אפשר לעשות בו-זמנית)
3. ניצול מיטבי של כלים וזמן
4. צמצום המתנות מיותרות

כללים:
- כל הטקסט בעברית.
- כל שדות הזמן הם מספר דקות כמחרוזת (למשל "25"), ללא יחידות, פרט ל-max_prep_time שהוא מספר שעות מראש כמחרוזת.
- time_saved הוא ההפרש בין total_sequential_time ל-total_optimized_time.
- dependencies מפנה לשמות שלבים קודמים, ורשימה ריקה אם אין תלות.
`;
}

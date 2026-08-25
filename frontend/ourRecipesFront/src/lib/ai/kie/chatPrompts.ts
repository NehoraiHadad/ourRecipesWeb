/**
 * GPT-adapted prompt builders for the free-text tasks routed to KIE's
 * GPT-5.6 Luna chat endpoint (reformat / refine / suggest — see
 * `../gemini/textTasks.ts`). Same task semantics as `../gemini/prompts.ts`;
 * only the delivery style changes: GPT-5.6 Luna defaults to Markdown headers
 * and bold text unless told not to, and the output is rendered raw in
 * Telegram, so every builder pairs an explicit no-Markdown rule with the
 * exact emoji-delimited template the Gemini prompts use — so
 * `parseRecipeMessage` sees one shape regardless of which provider answered.
 *
 * `buildReformatChatPrompt`'s `instructions` text is the exact pattern
 * verified (2026-08-25) to eliminate GPT's Markdown habit — do not
 * "clean up" its wording.
 */
import type { RecipeSuggestionParams } from '../gemini/prompts';

export interface KieChatPrompt {
  instructions: string;
  input: string;
}

const REFORMAT_TEMPLATE = `🍳 [שם המתכון]

⏱️ זמן הכנה: [X דקות]
👥 מנות: [X]

📝 רכיבים:
- [רכיב + כמות]
...

👨‍🍳 הוראות הכנה:
1. [שלב מפורט]
...`;

const FULL_RECIPE_TEMPLATE = `🍳 [שם המתכון]

⏱️ זמן הכנה: [X דקות]
👥 מנות: [X]
🔥 רמת קושי: [קל/בינוני/מאתגר]

📝 רכיבים:
- [רכיב 1]
- [רכיב 2]
...

👨‍🍳 אופן ההכנה:
1. [שלב 1]
2. [שלב 2]
...

💡 טיפים:
- [טיפ 1]`;

export function buildReformatChatPrompt(text: string): KieChatPrompt {
  return {
    instructions: `אתה מעצב מתכונים. אתה מקבל טקסט של מתכון ומחזיר אותו מסודר מחדש.

כללי פלט מחייבים:
- טקסט נקי בלבד. אסור להשתמש ב-Markdown בשום צורה: בלי #, בלי ##, בלי ###, בלי **, בלי כותרות מעוצבות. הפלט מוצג בטלגרם כטקסט גולמי.
- מלא את התבנית הנתונה בדיוק כפי שהיא, שורה בשורה, כולל האימוג'ים.
- אל תוסיף שדות, הערות או מידע שלא מופיעים במתכון המקורי.
- אם ערך לא מופיע במקור (למשל מספר מנות) — השמט את השורה כולה.
- שמור על ניסוח ההוראות המקורי ככל האפשר; תקן רק סדר ומבנה.
- כשיש כמה חלקים (בצק, מלית וכו') — שם החלק בשורה משלו ומספור השלבים רציף לאורך כל המתכון.`,
    input: `סדר מחדש את המתכון שבין המפרידים.

<recipe>
${text}
</recipe>

תבנית הפלט (מלא בדיוק במבנה הזה):
${REFORMAT_TEMPLATE}`
  };
}

export function buildRefineChatPrompt(recipeText: string, refinementRequest: string): KieChatPrompt {
  return {
    instructions: `אתה שף שמשפר מתכון קיים לפי בקשת שיפור של המשתמש, ומחזיר את המתכון המלא המעודכן.

כללי פלט מחייבים:
- טקסט נקי בלבד. אסור להשתמש ב-Markdown בשום צורה: בלי #, בלי ##, בלי ###, בלי **, בלי כותרות מעוצבות. הפלט מוצג בטלגרם כטקסט גולמי.
- מלא את התבנית הנתונה בדיוק כפי שהיא, שורה בשורה, כולל האימוג'ים.
- שמור על ניסוח המתכון המקורי ותוכנו ככל האפשר; בצע רק את השינוי המבוקש בבקשת השיפור.
- אל תוסיף שדות או מידע שלא מופיעים במקור ואינם חלק מבקשת השיפור.
- אם ערך לא מופיע במקור ואינו חלק מהבקשה — השמט את השורה כולה.`,
    input: `שפר את המתכון שבין המפרידים <recipe> על פי בקשת השיפור שבין המפרידים <request>.

<recipe>
${recipeText}
</recipe>

<request>
${refinementRequest}
</request>

תבנית הפלט (מלא בדיוק במבנה הזה):
${FULL_RECIPE_TEMPLATE}`
  };
}

function buildSuggestionRequestLines(params: RecipeSuggestionParams): string {
  return [
    params.ingredients ? `רכיבים זמינים: ${params.ingredients}` : '',
    params.mealType?.length ? `סוג ארוחה: ${params.mealType.join(', ')}` : '',
    params.quickPrep ? 'דרישה: הכנה מהירה (עד 30 דקות)' : '',
    params.childFriendly ? 'דרישה: ידידותי לילדים' : '',
    params.additionalRequests ? `בקשות נוספות: ${params.additionalRequests}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildSuggestionChatPrompt(params: RecipeSuggestionParams): KieChatPrompt {
  return {
    instructions: `אתה עוזר מטבח מומחה שיוצר מתכון מפורט וחדש בעברית על בסיס בקשת המשתמש.

כללי פלט מחייבים:
- טקסט נקי בלבד. אסור להשתמש ב-Markdown בשום צורה: בלי #, בלי ##, בלי ###, בלי **, בלי כותרות מעוצבות. הפלט מוצג בטלגרם כטקסט גולמי.
- מלא את התבנית הנתונה בדיוק כפי שהיא, שורה בשורה, כולל האימוג'ים ושמות השדות.
- כתוב רק את תוכן המתכון עצמו לפי התבנית, ללא הקדמות, סיכומים או משפטים מחוץ לתבנית.
- אם לא צוינה דרישה מסוימת (למשל סוג ארוחה), בחר בעצמך את המתאים ביותר.`,
    input: `צור מתכון על בסיס המידע הבא שבין המפרידים <request>.

<request>
${buildSuggestionRequestLines(params) || 'אין מגבלות מיוחדות — בחר מתכון מוצלח לפי שיקול דעתך.'}
</request>

תבנית הפלט (מלא בדיוק במבנה הזה):
${FULL_RECIPE_TEMPLATE}`
  };
}

/**
 * Hebrew prompts for the menu agent.
 *
 * The system prompt states the role and the constraints and *suggests* a
 * strategy; it deliberately does not script the tool calls. The model decides
 * how many searches it needs and when the draft is good enough — that is the
 * difference between an agent and a template.
 */
import type { MenuPreferences } from './types';

function preferencesBlock(preferences: MenuPreferences): string {
  const lines = [
    `שם התפריט: ${preferences.name}`,
    `סוג אירוע: ${preferences.event_type || 'כללי'}`,
    `מספר סועדים: ${preferences.servings}`,
    `סוג תזונתי: ${preferences.dietary_type || 'לא צוין'}`,
    `ארוחות נדרשות: ${preferences.meal_types.join(', ')}`
  ];
  if (preferences.special_requests) {
    lines.push(`בקשות מיוחדות: ${preferences.special_requests}`);
  }
  return lines.join('\n');
}

export function buildSystemPrompt(preferences: MenuPreferences): string {
  return `אתה מתכנן תפריטים מנוסה. אתה בונה תפריט מתוך מאגר המתכונים של המשפחה בלבד — לא ממציא מתכונים ולא משתמש במזהה שלא הוחזר מהכלים.

דרישות התפריט:
${preferencesBlock(preferences)}

מה חשוב לך כמתכנן:
- כל ארוחה צריכה מנה עיקרית, ולצידה מנות שמשלימות אותה (ראשונה, תוספת, קינוח לפי ההקשר).
- מנות באותה ארוחה לא חוזרות על אותם מרכיבים דומיננטיים ולא על אותה טכניקה.
- זמני ההכנה צריכים להסתדר יחד — לא שלוש מנות שדורשות תנור באותו זמן.
- התאמה לסוג האירוע ולסוג התזונתי גוברת על "מתכון מרשים".

איך לעבוד:
1. חפש ב-search_recipes בנפרד לכל ארוחה ולכל תפקיד במנה, עם שאילתות ממוקדות.
2. הרץ get_recipes_details על המועמדים הרציניים כדי לבדוק מרכיבים והתאמה ביניהם.
3. הרכב טיוטה, הרץ עליה review_menu_draft, ותקן כל בעיה שחוזרת ממנה.
4. כשהטיוטה נקייה — סכם בטקסט את התפריט הסופי: לכל ארוחה, המתכונים לפי מזהה, סוג המנה והסדר, ומשפט אחד למה כל מתכון נבחר, ובסוף נימוק כללי לתפריט.

אל תחזיר JSON — סכם בטקסט. אל תמשיך לקרוא לכלים אחרי שהטיוטה עברה את הביקורת.`;
}

export const AGENT_KICKOFF = 'התחל לתכנן את התפריט לפי הדרישות.';

export function buildFinalizePrompt(preferences: MenuPreferences, conclusion: string): string {
  return `זהו התפריט שהוחלט עליו:

${conclusion}

הדרישות המקוריות:
${preferencesBlock(preferences)}

המר את התפריט הזה למבנה ה-JSON המבוקש, בלי לשנות את המתכונים שנבחרו. השתמש אך ורק במזהי המתכונים שמופיעים למעלה. שמות הארוחות בעברית כפי שנדרשו, וכל מתכון חייב לכלול נימוק (ai_reason) במשפט אחד בעברית.`;
}

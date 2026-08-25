/**
 * Hebrew prompt templates for the Gemini text tasks. Copied verbatim from
 * the pre-migration `aiService.ts` — Wave 1B only swaps the model wrapper,
 * not the prompt content.
 */

export interface RecipeSuggestionParams {
  ingredients?: string;
  mealType?: string[];
  quickPrep?: boolean;
  childFriendly?: boolean;
  additionalRequests?: string;
}

export function buildSuggestionPrompt(params: RecipeSuggestionParams): string {
  return `
אתה עוזר מטבח מומחה. צור מתכון מפורט על בסיס המידע הבא:

${params.ingredients ? `רכיבים זמינים: ${params.ingredients}` : ''}
${params.mealType?.length ? `סוג ארוחה: ${params.mealType.join(', ')}` : ''}
${params.quickPrep ? 'דרישה: הכנה מהירה (עד 30 דקות)' : ''}
${params.childFriendly ? 'דרישה: ידידותי לילדים' : ''}
${params.additionalRequests ? `בקשות נוספות: ${params.additionalRequests}` : ''}

פורמט התגובה:
🍳 [שם המתכון]

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
- [טיפ 1]
`;
}

export function buildReformatPrompt(text: string): string {
  return `
עצב מחדש את המתכון הבא בפורמט מסודר וברור:

${text}

פורמט נדרש:
🍳 [שם המתכון]

⏱️ זמן הכנה: [X דקות]
👥 מנות: [X]

📝 רכיבים:
- [רכיב + כמות]
...

👨‍🍳 הוראות הכנה:
1. [שלב מפורט]
...

אל תוסיף מידע שלא מופיע במתכון המקורי.
`;
}

export function buildRefinePrompt(recipeText: string, refinementRequest: string): string {
  return `
המתכון הנוכחי:
${recipeText}

בקשת השיפור:
${refinementRequest}

שפר את המתכון על פי הבקשה, אך שמור על המבנה והפורמט המקורי.
`;
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

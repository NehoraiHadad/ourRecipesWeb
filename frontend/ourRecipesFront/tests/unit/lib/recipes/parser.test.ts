import { describe, it, expect } from 'vitest';
import {
  getFirstLine,
  getDetails,
  parseRecipeMessage,
  formatRecipeText
} from '@/lib/recipes/parser';

// Fixture 1: the canonical "reformatted recipe" example embedded verbatim in
// the Python AI service's prompt (backend/ourRecipesBack/services/ai_service.py,
// AIService.reformat_recipe's system_prompt example) — this is the exact
// shape the backend expects real channel messages to have, all fields
// present.
const FULL_RECIPE = `כותרת: עוגת שוקולד פשוטה ומהירה
קטגוריות: עוגות, קינוחים, אפייה
זמן הכנה: 45 דקות
רמת קושי: קל
רשימת מצרכים:
- 2 ביצים
- 1 כוס סוכר
- 1 כוס קמח
- חצי כוס שמן
- חצי חבילה של שוקולד
- חצי שקית אבקת אפייה
הוראות הכנה:
1. לחמם את התנור ל-180 מעלות.
2. בקערה גדולה, לערבב יחד את הביצים, הסוכר, הקמח, השמן, השוקולד ואבקת האפייה.
3. לשפוך את התערובת לתבנית ונאפה עד שהעוגה מוכנה.`;

// Fixture 2: same shape as backend/tests/test_categories.py's raw_content
// fixtures (copied verbatim: "כותרת: ...\nקטגוריות: ...\nמצרכים:\n- ...").
// It uses the shorter "מצרכים:" label rather than "רשימת מצרכים:" — a real
// channel-message shape the parser now recognizes as an ingredients-section
// synonym (see `INGREDIENTS_LABELS` in parser.ts).
const CATEGORIES_FIXTURE = 'כותרת: מתכון 1\nקטגוריות: קינוחים, עוגות\nמצרכים:\n- סוכר';

describe('getFirstLine', () => {
  it('extracts and strips the first line like RecipeService.get_first_line', () => {
    expect(getFirstLine('כותרת: עוגה\nשורה שנייה')).toBe('כותרת: עוגה');
  });

  it('strips leading/trailing * and : characters (Python str.strip("*:"))', () => {
    expect(getFirstLine('**כותרת: עוגה**\nרכיב')).toBe('כותרת: עוגה');
    expect(getFirstLine(':::שם:::\nרכיב')).toBe('שם');
  });

  it('returns empty string for empty input', () => {
    expect(getFirstLine('')).toBe('');
  });
});

describe('getDetails', () => {
  it('returns everything after the first line', () => {
    expect(getDetails('כותרת: עוגה\nשורה 1\nשורה 2')).toBe('שורה 1\nשורה 2');
  });

  it('returns empty string when there is only one line', () => {
    expect(getDetails('כותרת: עוגה')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(getDetails('')).toBe('');
  });
});

describe('parseRecipeMessage', () => {
  it('extracts every field from a fully-formed recipe message', () => {
    const result = parseRecipeMessage(FULL_RECIPE);

    expect(result.title).toBe('עוגת שוקולד פשוטה ומהירה');
    expect(result.categories).toEqual(['עוגות', 'קינוחים', 'אפייה']);
    expect(result.ingredients).toEqual([
      '2 ביצים',
      '1 כוס סוכר',
      '1 כוס קמח',
      'חצי כוס שמן',
      'חצי חבילה של שוקולד',
      'חצי שקית אבקת אפייה'
    ]);
    expect(result.instructions).toBe(
      '1. לחמם את התנור ל-180 מעלות.\n' +
        '2. בקערה גדולה, לערבב יחד את הביצים, הסוכר, הקמח, השמן, השוקולד ואבקת האפייה.\n' +
        '3. לשפוך את התערובת לתבנית ונאפה עד שהעוגה מוכנה.'
    );
    expect(result.preparationTime).toBe(45);
    expect(result.difficulty).toBe('EASY');
    expect(result.raw).toBe(FULL_RECIPE);
    expect(result.isParsed).toBe(true);
    expect(result.parseErrors).toEqual([]);
  });

  it('handles a message without a categories line', () => {
    const text = `כותרת: מרק עוף קלאסי
רשימת מצרכים:
- עוף
- גזר
הוראות הכנה:
1. לבשל שעה.`;

    const result = parseRecipeMessage(text);

    expect(result.title).toBe('מרק עוף קלאסי');
    expect(result.categories).toEqual([]);
    expect(result.ingredients).toEqual(['עוף', 'גזר']);
    expect(result.isParsed).toBe(false);
    expect(result.parseErrors).toContain('לא נמצאו קטגוריות');
  });

  it('handles a message that is just a title', () => {
    const result = parseRecipeMessage('כותרת: מרק עוף');

    expect(result.title).toBe('מרק עוף');
    expect(result.categories).toEqual([]);
    expect(result.ingredients).toEqual([]);
    expect(result.instructions).toBe('');
    expect(result.preparationTime).toBeUndefined();
    expect(result.difficulty).toBeUndefined();
    expect(result.isParsed).toBe(false);
    expect(result.parseErrors).toEqual(
      expect.arrayContaining([
        'לא נמצאו מצרכים',
        'לא נמצאו הוראות הכנה',
        'לא נמצאו קטגוריות',
        'לא צוין זמן הכנה',
        'לא צוינה רמת קושי'
      ])
    );
  });

  it('handles an empty ingredients section (header with no bullets)', () => {
    const text = `כותרת: תה צמחים
קטגוריות: משקאות
רשימת מצרכים:
הוראות הכנה:
1. להרתיח מים.
2. להוסיף עלי תה.`;

    const result = parseRecipeMessage(text);

    expect(result.ingredients).toEqual([]);
    expect(result.instructions).toBe('1. להרתיח מים.\n2. להוסיף עלי תה.');
    expect(result.parseErrors).toContain('לא נמצאו מצרכים');
  });

  it('accepts "מצרכים:" (backend/tests/test_categories.py fixture shape) as an ingredients-section label', () => {
    const result = parseRecipeMessage(CATEGORIES_FIXTURE);

    expect(result.title).toBe('מתכון 1');
    expect(result.categories).toEqual(['קינוחים', 'עוגות']);
    expect(result.ingredients).toEqual(['סוכר']);
  });

  it('accepts "רכיבים:" as an ingredients-section label', () => {
    const text = `כותרת: סלט ירקות
קטגוריות: סלטים
רכיבים:
- מלפפון
- עגבנייה
הוראות הכנה:
1. לחתוך ולערבב.`;

    const result = parseRecipeMessage(text);

    expect(result.ingredients).toEqual(['מלפפון', 'עגבנייה']);
  });

  it('accepts "מורכב" as a difficulty label, mapping to HARD (matches the AI prompts and client formatter)', () => {
    const text = `כותרת: תבשיל מורכב
קטגוריות: עיקריות
רמת קושי: מורכב
רשימת מצרכים:
- דבר
הוראות הכנה:
1. עשה.`;

    const result = parseRecipeMessage(text);

    expect(result.difficulty).toBe('HARD');
    expect(result.parseErrors.some((e) => e.startsWith('רמת קושי לא תקינה'))).toBe(false);
  });

  it('still accepts "קשה" as a difficulty label, mapping to HARD', () => {
    const text = `כותרת: תבשיל קשה
קטגוריות: עיקריות
רמת קושי: קשה
רשימת מצרכים:
- דבר
הוראות הכנה:
1. עשה.`;

    const result = parseRecipeMessage(text);

    expect(result.difficulty).toBe('HARD');
  });

  it('flags a message missing the כותרת: prefix but still uses the first line as a fallback title', () => {
    const result = parseRecipeMessage('עוגה סתם ככה\nרשימת מצרכים:\n- קמח\nהוראות הכנה:\n1. לאפות.');

    expect(result.title).toBe('עוגה סתם ככה');
    expect(result.parseErrors).toContain('חסרה כותרת מתכון');
  });

  it('keeps the first 5 categories when more than 5 are given, rather than dropping all of them', () => {
    const text = `כותרת: מתכון
קטגוריות: א, ב, ג, ד, ה, ו
רשימת מצרכים:
- דבר
הוראות הכנה:
1. עשה.`;

    const result = parseRecipeMessage(text);

    expect(result.categories).toEqual(['א', 'ב', 'ג', 'ד', 'ה']);
    expect(result.parseErrors).not.toContain('יותר מדי קטגוריות (מקסימום 5)');
    expect(result.parseErrors).not.toContain('לא נמצאו קטגוריות');
  });

  it('treats an out-of-range preparation time as invalid (1-1440 minutes)', () => {
    const text = `כותרת: מתכון
זמן הכנה: 2000 דקות
רשימת מצרכים:
- דבר
הוראות הכנה:
1. עשה.`;

    const result = parseRecipeMessage(text);

    expect(result.preparationTime).toBeUndefined();
    expect(result.parseErrors).toContain('זמן הכנה חייב להיות בין 1 ל-1440 דקות');
  });

  it('returns an empty-content result for blank input', () => {
    const result = parseRecipeMessage('   ');

    expect(result.title).toBe('');
    expect(result.categories).toEqual([]);
    expect(result.ingredients).toEqual([]);
    expect(result.instructions).toBe('');
    expect(result.isParsed).toBe(false);
    expect(result.parseErrors).toEqual(['תוכן המתכון ריק']);
  });
});

describe('formatRecipeText', () => {
  it('formats structured fields into the canonical channel message', () => {
    const text = formatRecipeText({
      title: 'עוגת שוקולד',
      categories: ['עוגות', 'קינוחים'],
      ingredients: ['ביצים', 'סוכר'],
      instructions: '1. לערבב.\n2. לאפות.',
      preparationTime: 45,
      difficulty: 'EASY'
    });

    expect(text).toBe(
      `כותרת: עוגת שוקולד
קטגוריות: עוגות, קינוחים
זמן הכנה: 45 דקות
רמת קושי: קל
רשימת מצרכים:
- ביצים
- סוכר
הוראות הכנה:
1. לערבב.
2. לאפות.`
    );
  });

  it('round-trips through parseRecipeMessage', () => {
    const parsed = parseRecipeMessage(FULL_RECIPE);
    const reformatted = formatRecipeText(parsed);
    const reparsed = parseRecipeMessage(reformatted);

    expect(reparsed.title).toBe(parsed.title);
    expect(reparsed.categories).toEqual(parsed.categories);
    expect(reparsed.ingredients).toEqual(parsed.ingredients);
    expect(reparsed.instructions).toBe(parsed.instructions);
    expect(reparsed.preparationTime).toBe(parsed.preparationTime);
    expect(reparsed.difficulty).toBe(parsed.difficulty);
  });
});

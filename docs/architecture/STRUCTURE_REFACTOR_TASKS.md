# ריפקטור תשתית: מקור אמת מובנה למתכונים + מחיקה בעמודי ניהול

> מסמך בריף לסשן ביצוע ייעודי. נכתב 2026-08-25 אחרי אבחון מלא בפרודקשן.
> העיקרון המנחה (מהזיכרון הקבוע): לבנות נכון וקדימה — לא לשחזר התנהגות Flask.

## 1. הבעיה — מצב קיים (עובדות מאומתות)

- ב-DB (`prisma/schema.prisma`, מודל `Recipe`) יש **גם** `raw_content` (הטקסט המלא מהערוץ)
  **וגם** שדות מובנים: `title`, `ingredients` (טקסט מופרד `||`), `instructions`,
  `categories` (CSV), `difficulty`, `preparation_time`, `servings`,
  ועמודות `ingredients_list Json` / `formatted_content Json` / `recipe_metadata Json` שכמעט ריקות.
- **יש שני פרסרים**: השרת מפרסר בזמן כתיבה (`src/lib/recipes/parser.ts` — כולל
  `formatRecipeText` הופכי עם round-trip), אבל ה-UI מתעלם מהשדות המובנים ומפרסר
  מחדש את הטקסט בדפדפן (`src/utils/formatChecker.tsx` — פרסר ישן ומקל, למשל מחפש
  בדיוק `רשימת מצרכים:` בעוד הזיהוי בודק `מצרכים:`).
- נתוני פרודקשן: **204 מתכונים; 129 בפורמט מובנה; 115 עם `is_parsed=true`;
  ~75 בטקסט חופשי ישן** (יוצגו כטקסט גולמי עד ההמרה — שלב נפרד, לא במסמך הזה).
- מחיקה/ארכוב היום רק דרך עריכת ההודעה בטלגרם עם תחילית 🗑️ — לא אינטואיטיבי.
  `botApi.deleteMessage` קיים; למקומות יש `DELETE /api/places/[id]`; לתפריטים יש
  DELETE + מחיקת הודעת שיקוף (`menuMirror`); **למתכונים אין DELETE בכלל**.

## 2. עקרונות היעד

1. **פרסר אחד, בשרת, בזמן כתיבה.** הדפדפן לעולם לא מפרסר טקסט מתכון.
2. **הטקסט בערוץ נשאר מקור האמת האנושי**; השדות המובנים ב-DB הם נגזרת שמתחדשת
   בכל ingest. `formatRecipeText(parse(text))` חייב round-trip יציב (בדיקות!).
3. **חוזה אחד**: serializer יחיד לכל ישות + טיפוס משותף שגם ה-API וגם ה-UI מייבאים.
4. **קבצים ≤150 שורות**, DRY, מחיקת קוד מת עם כל החלפה (בלי "נשאיר ליתר ביטחון").
5. פריסה אחת בסוף (Vercel cost guardrail) — בדיקות ו-build מקומיים קודם.

## 3. ארכיטקטורת יעד — הזרימה

```
טלגרם (טקסט) ──webhook──▶ channelIngest ──▶ parseRecipeText ──▶ DB (raw + מובנה)
UI (טופס מובנה) ──▶ formatRecipeText ──▶ טלגרם ──▶ אותו ingest ──▶ DB
DB (שדות מובנים) ──serializer──▶ API ──▶ UI מרנדר ישירות. fallback יחיד: is_parsed=false → תצוגת טקסט.
```

## 4. שלבי ביצוע

### שלב A — מודל דומיין + פרסור מצרכים מובנה
- [ ] A1 טיפוס `StructuredIngredient = { quantity?: number|string, unit?: string, name: string, note?: string }`
      ופירוק שורת מצרך עברית (`"2 כפות סוכר"` → כמות/יחידה/שם) במודול נפרד
      `src/lib/recipes/ingredientParser.ts`. כישלון פירוק = graceful: הכל ב-`name`.
- [ ] A2 `ParsedRecipe` מקבל `structuredIngredients: StructuredIngredient[]`.
- [ ] A3 בדיקות יחידה: פירוק שורות מצרך (שברים "וחצי", טווחים "70-80%", בלי כמות),
      ו-round-trip מלא parse⇄format על פיקסטורות אמיתיות מהערוץ.

### שלב B — כתיבה ל-DB + backfill
- [ ] B1 ingest שומר את `structuredIngredients` ב-`ingredients_list` (העמודה כבר קיימת).
- [ ] B2 החלטה על עמודות מתות: `formatted_content`, `recipe_metadata`, ושדה
      `ingredients` הטקסטואלי (`||`) — לאחד ל-`ingredients_list` ולמחוק את היתר
      במיגרציה (לא להשאיר כפילות).
- [ ] B3 backfill: ריצה חד-פעמית שמפרסרת מחדש את כל 204 המתכונים מ-`raw_content`
      (מקומית מול ה-DB, בלי טלגרם) וממלאת את השדות החדשים. לאמת ספירות לפני/אחרי.

### שלב C — חוזה API אחיד
- [ ] C1 serializer יחיד `serializeRecipe` (כמו `serializeMenu`) + טיפוס תשובה משותף;
      כל ה-routes (search/manage/[telegram_id]) עוברים אליו. בלי פרויקציות ידניות שונות.
- [ ] C2 `recipeMapper` בצד הלקוח מצטמצם/נעלם — ה-UI מקבל את הטיפוס המשותף ישירות.
      לוודא שאין יותר משמעות כפולה ל-`details`.

### שלב D — UI מרנדר מובנה בלבד
- [ ] D1 `RecipeDetails` מרנדר מהשדות המובנים (מצרכים, שלבים, קטגוריות, זמן, קושי) —
      בלי `parseRecipe` בצד לקוח. מכפיל המנות (1X/2X) עובד על `quantity` המספרי.
- [ ] D2 מחיקת `src/utils/formatChecker.tsx` + כל השימושים
      (`MealSuggestionForm`, `VersionHistory` — גרסאות ירונדרו דרך פרסור שרת או שדה שמור).
- [ ] D3 קומפוננטת fallback מפורשת `RawRecipeView` ל-`is_parsed=false` (טקסט נקי, לא "שבור").
- [ ] D4 תצוגות מקדימות (ניהול, חיפוש, תפריטים) — מאותם שדות מובנים.

### שלב E — עריכה דרך הפורמטר
- [ ] E1 שמירת עריכה: הטופס בונה אובייקט מובנה → `formatRecipeText` → טלגרם → ingest.
      אף קומפוננטה לא מרכיבה טקסט ערוץ ידנית.
- [ ] E2 גם מסלולי AI (reformat, הצעות ארוחה) עוברים דרך אותו parse/format.

### שלב F — מחיקה בעמודי הניהול (UX)
- [ ] F1 מתכונים: `DELETE /api/recipes/[telegram_id]` חדש — `deleteMessage` בערוץ +
      שורה ל-`ARCHIVED` (או מחיקה קשיחה? ברירת מחדל: ארכוב, עם אופציית מחיקה לצמיתות
      נפרדת). כפתור מחיקה + דיאלוג אישור ב-`components/management/RecipeList/Grid`.
      מוסכמת 🗑️ בערוץ ממשיכה לעבוד במקביל (webhook).
- [ ] F2 מקומות: ה-route קיים — לוודא כפתור מחיקה + אישור בעמוד המקומות.
- [ ] F3 תפריטים: route + מחיקת שיקוף קיימים — לוודא כפתור + אישור בעמוד התפריטים.
- [ ] F4 עקביות: אותו דפוס דיאלוג אישור לשלוש הישויות (קומפוננטה משותפת אחת).

### שלב G — אימות וסגירה
- [ ] G1 `npm test` + `tsc` + build מקומי ירוקים; בדיקות round-trip עוברות.
- [ ] G2 פריסה אחת ל-production ואימות בדפדפן: מתכון מובנה, מתכון חופשי (fallback),
      עריכה, מכפיל מנות, מחיקה משלושת עמודי הניהול.
- [ ] G3 עדכון `DEPLOYMENT_TASKS.md` + מסמך זה (צ'קבוקסים).

## 5. תוכנית ביצוע בתת-סוכנים (נקבעה 2026-08-25 בסשן הביצוע)

החלטות: (1) B2 — מוחקים `formatted_content`, `recipe_metadata` ועמודת `ingredients`
הטקסטואלית; `ingredients_list` הוא המקור היחיד; חיפוש חופשי עובר ל-title+raw_content.
(2) drop עמודות בפועל רק אחרי פריסת הקוד החדש (הקוד הישן בפרודקשן עוד כותב אליהן).
(3) F1 — מחיקה = `deleteMessage` בערוץ + `status=ARCHIVED`. (4) `ConfirmDialog` משותף.

| גל | סוכן | שלבים | סטטוס |
|---|---|---|---|
| 1 | A-parser (Opus) | A1–A3 | ⬜ |
| 1 | F-delete (Sonnet) | F1–F4 | ⬜ |
| 2 | B-ingest (Sonnet) | B1 + סקריפט backfill | ⬜ |
| 3 | C-contract (Opus) | C1–C2 | ⬜ |
| 4 | D-main (Opus) | D1, D3, E1, E2 | ⬜ |
| 4 | D-aux (Sonnet) | D2, D4 | ⬜ |
| 5 | ראשי | G1–G3 + backfill + drop עמודות | ⬜ |

## 6. מחוץ לתחולה (שלבים עתידיים, לא לגעת עכשיו)
- המרת ~75 המתכונים החופשיים עם Gemini (אחרי שהתשתית יציבה — יקבלו סשן משלהם).
- טבלאות מצרכים מנורמלות (Ingredient/RecipeIngredient) — רק אם יידרש פיצ'ר
  חוצה-מתכונים; `ingredients_list` JSON נותן את רוב הערך בלי המורכבות.
- שלב 6 של הפריסה (כיבוי Render + רוטציית סודות) — ממתין לאישור בנפרד.

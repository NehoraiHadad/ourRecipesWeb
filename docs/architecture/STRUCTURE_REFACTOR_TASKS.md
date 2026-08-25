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
- [x] A1 טיפוס `StructuredIngredient = { quantity?: number|string, unit?: string, name: string, note?: string }`
      ופירוק שורת מצרך עברית (`"2 כפות סוכר"` → כמות/יחידה/שם) במודול נפרד
      `src/lib/recipes/ingredientParser.ts`. כישלון פירוק = graceful: הכל ב-`name`.
      + `ingredientLexicon.ts` (יחידות/שברים/דקדוק כמויות) ו-`quantityAsNumber`
      למכפיל המנות. צורה קנונית: `quantity` מספרי רק למספר רגיל ("2", "1.5");
      שבר/מילה/טווח נשמרים כמחרוזת מילולית → round-trip מדויק.
- [x] A2 `ParsedRecipe` מקבל `structuredIngredients: StructuredIngredient[]`.
      `parser.ts` פוצל (`parserLabels` / `parserFields` / `messageText` /
      `recipeFormatter`) וירד ל-149 שורות בלי שינוי התנהגות.
- [x] A3 בדיקות יחידה: פירוק שורות מצרך (שברים "וחצי", טווחים "70-80%", בלי כמות),
      ו-round-trip מלא parse⇄format על פיקסטורות אמיתיות מהערוץ. 65 בדיקות ירוקות.

### שלב B — כתיבה ל-DB + backfill
- [x] B1 helper משותף `recipeFieldsFromParsed` (`src/lib/recipes/recipeFields.ts`);
      כל 5 נתיבי הכתיבה (ingest, POST create, PUT, restore, bulk parse) עברו אליו —
      כותבים `ingredients_list` בלבד, אף אחד לא כותב יותר לעמודת `ingredients` הטקסטואלית.
- [x] B2 `formatted_content`/`recipe_metadata` כבר לא נקראים/נכתבים בשום מקום ב-`src`
      (נבדק בגריפ מלא). כתיבות ל-`ingredients` הוסרו מכל 5 הנתיבים; חיפוש חופשי
      (`/api/recipes/search`) עבר ל-title+raw_content בלבד. פרויקציות קריאה
      (`manage`, `search` select, `versioning.ts`, `mirrorPending.ts`) לא נגעו בהן —
      שלב C.
- [x] B3 סקריפט backfill מוכן: `scripts/backfillStructuredRecipes.ts` +
      `npm run backfill:structured` (dry-run כברירת מחדל, `--apply` לכתיבה בפועל).
      טרנספורמציה טהורה + בדיקות יחידה ב-`src/lib/recipes/backfillTransform.ts`.
      הרצה בפועל מול הפרודקשן — ממתינה לשלב G.

### שלב C — חוזה API אחיד
- [x] C1 `src/lib/serializers/recipe.ts` (`recipeSelect` / `recipeWithRelationsSelect` /
      `serializeRecipe`) + טיפוס החוזה `SerializedRecipe` ב-`recipeTypes.ts` (בלי
      תלויות ריצה — ה-UI מייבא ממנו `import type`). כל 4 נתיבי הקריאה
      (search, manage, `[telegram_id]` GET+PUT, POST create) עברו אליו; אפס פרויקציות
      ידניות. מצרכים מ-`ingredients_list` בלבד, `parse_errors` מערך, בלי `details`.
- [x] C2 `recipeMapper` ירד ל-35 שורות — אדפטר דק בלבד לטיפוס ה-UI הישן
      (`TODO(stage-D)`); `details` תמיד `raw_content`. `versioning.ts` מצלם
      מ-`ingredients_list` (שורות דרך `formatIngredient`, כדי ש-VersionHistory
      ימשיך לעבוד עד שלב D); ה-fallback הישן ב-`mirrorPending.ts` נמחק
      (`raw_content` הוא NOT NULL), וכך גם קריאות העמודה הישנה ב-
      `shoppingListService` / `menuPlannerService` והתיקייה המתה `src/lib/types/`.

### שלב D — UI מרנדר מובנה בלבד

> D2+D4 (גל 4, D-aux) סגרו את הפער: הטיפוס הישן `recipe` (`src/types/index.ts`),
> `src/services/recipeMapper.ts` (`toUiRecipe`), שלושת העוטפים
> `TODO(stage-D)` ב-`recipeService` (`getRecipeById`/`createRecipe`/`updateRecipe`)
> ו-`src/utils/formatChecker.tsx` — כולם נמחקו. כל הקומפוננטות (כולל
> `RecipeModal`, `MealSuggestionForm`, `VersionHistory`,
> `Recipes`/`RecipeGridItem`/`RecipeListItem`, `management/RecipeList`+`RecipeGrid`,
> `RecipeManagement`, `Search`/`SearchContext`/`searchService`, `MenuDisplay`,
> `MenuGenerator`, `app/(main)/page.tsx`) צורכות `SerializedRecipe` ישירות.

- [x] D1 `RecipeDetails` / `RecipeDisplay` / `RecipeEditForm` צורכים `SerializedRecipe`
      ומרנדרים מהשדות המובנים בלבד — אפס `parseRecipe`/`isRecipeUpdated` בהם.
      מכפיל המנות עובר דרך `quantityAsNumber` (`lib/recipes/servingsScale.ts`,
      + בדיקות): כמות שאינה מספר יחיד (טווח/טקסט) מוצגת כלשונה בלי שינוי.
      פוצלו קומפוננטות: `IngredientListView` / `ServingsMultiplier` /
      `RecipeTimersPanel` + `ActiveTimerRow` / `RecipeInfographic` /
      `RecipeImageField` / `CategoryPicker` / `useRecipeActions`
      (RecipeDetails 521→211, RecipeDisplay 646→148, RecipeEditForm 482→157).
- [x] D2 נמחק `src/utils/formatChecker.tsx` (+ `src/tests/formatChecker.test.tsx`,
      `src/tests/categories.test.ts` — כפולים ל-`tests/unit/lib/recipes/parser.test.ts`).
      `VersionHistory` מרנדר מ-`content` השמור ב-`versionToDict` (טיפוס חדש
      `RecipeVersionEntry`/`RecipeVersionContent` ב-`recipeTypes.ts`) — ללא
      `parseRecipe` בצד לקוח, fallback ל-`RawRecipeView` כשאין תוכן מובנה.
      `/api/recipes/suggest`+`/refine` מריצים `parseRecipeMessage` בשרת ומחזירים
      `{ message, recipe }` (`serializePreviewFromParsed`,
      `src/lib/serializers/recipePreview.ts`); `MealSuggestionForm` מרנדר את
      התצוגה המקדימה מ-`SerializedRecipe` שחוזר, בלי פרסור בצד לקוח.
- [x] D3 `src/components/recipe/RawRecipeView.tsx` (68 שורות): כותרת + טקסט עם
      שמירת שורות. משמש כשאין תוכן מובנה (`hasStructuredContent` ב-
      `lib/recipes/recipeView.ts` — `is_parsed`, או מצרכים+הוראות קיימים) וגם
      כתצוגה מקדימה לטקסט AI שטרם נשמר.
- [x] D4 כל הקומפוננטות שנותרו עברו ל-`SerializedRecipe`: `RecipeModal`,
      `Recipes`/`RecipeGridItem`/`RecipeListItem`, `management/RecipeList`+`RecipeGrid`,
      `RecipeManagement`, `Search`/`SearchContext`/`searchService`, `MenuDisplay`,
      `MenuGenerator`, `app/(main)/page.tsx`. תצוגות מקדימות (ניהול) נגזרות משדות
      מובנים דרך `previewIngredientLines`/`hasStructuredContent`
      (`lib/recipes/recipeView.ts`) — לא פרסור טקסט. `favorite-recipes` /
      `recently-viewed-recipes` ב-localStorage כבר החזיקו רק מזהים/שדות מינימליים
      ולא דרשו מיגרציה. נמחקו: `src/services/recipeMapper.ts`, הטיפוס הישן `recipe`
      וגם `RecipeVersion` המיושן ב-`types/index.ts`, ושלושת העוטפים
      `TODO(stage-D)` ב-`recipeService`. יוצא דופן מתועד: נתיב ה-restore
      (`api/versions/recipe/[telegram_id]/restore/[versionId]`) עדיין מחזיר שדה
      `details` — זו תאימות-Flask מכוונת בחוזה ה-API, לא שריד של טיפוס ה-UI הישן.

### שלב E — עריכה דרך הפורמטר
- [x] E1 `RecipeEditForm` בונה `FormatRecipeInput` (`components/recipe/recipeDraft.ts`,
      שורות מצרכים מ-`formatIngredient`) → `formatRecipeText` → `PUT { newText }`.
      נמחקו כל שלושת ההרכבות הידניות של טקסט ערוץ (`RecipeDetails.buildRecipeText`,
      `management/RecipeList`, `management/RecipeGrid`) וגם
      `share.formatRecipeForSharing` המת. מתכון בלי תוכן מובנה נערך כטקסט הערוץ
      עצמו (במקום לאבד את מה שאינו מזוהה כסקשן).
- [x] E2 אחרי כתיבה ה-UI מאמץ את מה שהשרת פירסר: `PUT` מחזיר
      `SerializedRecipeWithRelations` (נשמר ישירות ב-state), ושחזור גרסה מלווה
      ב-`GET` מחדש (`useRecipeActions`) — נתיב ה-restore לא שונה. טקסט AI
      (reformat) מוצג כתצוגה מקדימה גולמית עד שמירה, ואז מוחלף במתכון המפורסר.
      הצעות ארוחה (`MealSuggestionForm`) עברו ל-D2 (מרנדרות `SerializedRecipe`
      שחוזר מהשרת, ללא פרסור בצד לקוח).

### שלב F — מחיקה בעמודי הניהול (UX)
- [x] F1 מתכונים: `DELETE /api/recipes/[telegram_id]` — ארכוב (`status=ARCHIVED`) +
      `deleteMessage` בערוץ best-effort (מדולג ל-`telegram_id<=0`). לוגיקה ב-
      `src/lib/recipes/deleteRecipe.ts`; כפתור מחיקה + `ConfirmDialog` ב-RecipeList/Grid
      דרך `RecipeManagement`; `recipeService.deleteRecipe`. 6 בדיקות אינטגרציה.
      מוסכמת 🗑️ בערוץ ממשיכה לעבוד במקביל (webhook).
- [x] F2 מקומות: המודל הידני בעמוד המקומות הוחלף ב-`ConfirmDialog` (התנהגות זהה).
- [x] F3 תפריטים: כל שלושת ה-`window.confirm` ב-`MenuDisplay` + ה-confirm ב-
      `ShoppingListDisplay` הוחלפו ב-`ConfirmDialog` (state יחיד `pendingConfirm`).
- [x] F4 עקביות: `src/components/ui/ConfirmDialog.tsx` (68 שורות) עוטף את `Modal`
      ומשמש את שלוש הישויות.

### שלב H — DB-first (הרחבת תכולה, הוחלט תוך כדי הסשן)
> הדגש עובר ל-DB כמקור התפעולי; טלגרם = ערוץ קלט/הפצה בלבד.
- [x] H1 יצירה/עריכת מתכון: `POST`/`PUT /api/recipes` כותבים ל-DB קודם
      (`sync_status='pending_telegram'`, ב-create עם `telegram_id` שלילי מ-
      `generatePendingTelegramId`) ורק אז מנסים שיקוף לטלגרם best-effort; הצלחה
      → פאץ' ל-`telegram_id`/`synced` (+`last_sync`), כישלון → נשאר pending עם
      `sync_error`. לוגיקת ה-DB פוצלה ל-`src/lib/recipes/createRecipe.ts` /
      `updateRecipe.ts` כדי לשמור על ה-routes דקים. `mirrorPendingRecipes`
      (`mirrorPending.ts`) הורחב: `telegram_id` שלילי = פנייה ראשונה
      (`sendMessage`), חיובי = עריכה pending שנכשלה בעבר → `mirrorEditRecipe`
      על אותה הודעה (לעולם לא `sendMessage` שני, שהיה משכפל בערוץ). בדיקות
      `recipes-create`/`recipes-update`/`internal-reconcile` עודכנו לסדר החדש
      + בדיקות מפורשות ל-pending edit retry ולכך שכשל טלגרם עדיין מחזיר הצלחה.
- [x] H2 `GET /api/menus` עובר מ-select ידני ל-`menuMealsInclude`+`serializeMenu`
      המשותפים (אותו חוזה כמו `POST`/`GET /api/menus/[id]`); ה-UI (`menus/page.tsx`,
      `menuService`) צורך רק `id`/`name`/`meals.length`/שדות סקלריים שכולם
      נשארו תואמים. בדיקת `read-projections.test.ts` עודכנה לבדוק `include`
      במקום `select` ידני.

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
| 1 | A-parser (Opus) | A1–A3 | ✅ |
| 1 | F-delete (Sonnet) | F1–F4 | ✅ |
| 2 | B-ingest (Sonnet) | B1 + סקריפט backfill | ✅ |
| 3 | C-contract (Opus) | C1–C2 | ✅ |
| 4 | D-main (Opus) | D1, D3, E1, E2 | ✅ |
| 4 | D-aux (Sonnet) | D2, D4 | ✅ |
| 5 | ראשי | G1–G3 + backfill + drop עמודות | ⬜ |

## 6. מחוץ לתחולה (שלבים עתידיים, לא לגעת עכשיו)
- המרת ~75 המתכונים החופשיים עם Gemini (אחרי שהתשתית יציבה — יקבלו סשן משלהם).
- טבלאות מצרכים מנורמלות (Ingredient/RecipeIngredient) — רק אם יידרש פיצ'ר
  חוצה-מתכונים; `ingredients_list` JSON נותן את רוב הערך בלי המורכבות.
- שלב 6 של הפריסה (כיבוי Render + רוטציית סודות) — ממתין לאישור בנפרד.

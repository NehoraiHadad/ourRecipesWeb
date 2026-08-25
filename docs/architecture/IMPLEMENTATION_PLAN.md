# 🚀 תוכנית מימוש מקצה לקצה

**מסמך אב**: [ARCHITECTURE.md](./ARCHITECTURE.md) — לקרוא קודם. כל החלטה שם מחייבת כאן.
**שיטת עבודה**: גלים (Waves) של תת-סוכנים במקביל. בתוך גל — אין תלות בין משימות;
בין גלים — יש. כל משימה כוללת קריטריון קבלה. אין מעבר גל בלי `npm run build` ירוק
+ `npx vitest run` ירוק.

**מיקום הקוד**: כל העבודה בתוך `frontend/ourRecipesFront/` (נקסט) אלא אם צוין אחרת.
**עיקרון פורט**: כשמשימה אומרת "פורט מ-Flask" — הלוגיקה מועתקת 1:1 מהקובץ שצוין,
לא מומצאת מחדש. שמות שדות ב-response חייבים להישאר זהים למה שה-UI מצפה לו.

---

## Wave 0 — תשתיות ליבה (סוכן אחד, הכל תלוי בזה)

### 0.1 ספריית Bot API — `src/lib/telegram/botApi.ts`
`fetch` בלבד מול `https://api.telegram.org/bot<TOKEN>/`:
`sendMessage`, `sendPhoto`, `editMessageText`, `editMessageCaption`,
`editMessageMedia`, `deleteMessage`, `getFile` (+הורדת הקובץ), `getChatMember`.
עטיפת שגיאות אחידה + טיפוסים. אין ספריות bot חיצוניות.
**קבלה**: unit tests עם fetch ממוקק לכל פונקציה.

### 0.2 ספריית Auth — `src/lib/auth/`
פורט מ-`backend/ourRecipesBack/services/auth_service.py`:
- `verifyTelegramLogin(authData)` — HMAC-SHA256, מפתח `sha256(BOT_TOKEN)`, בדיקת `auth_date` (עד 24h).
- `signSession` / `verifySession` עם `jose` — JWT ב-httpOnly cookie
  (`Secure`, `SameSite=Lax`, 7 ימים). Claims: `sub` (user_id), `auth_type`, `permissions.can_edit`.
- `checkEditPermission(userId)` — Bot API `getChatMember` על הערוץ הראשי; true רק אם
  `status==='creator'` או (`status==='administrator'` && `can_edit_messages`).
  Cache בזיכרון 1h (מספיק ל-serverless; מתאפס בקור-סטארט וזה בסדר).
- `requireAuth(request)` / `requireEditPermission(request)` — helpers ל-routes.
**קבלה**: unit tests לאימות HMAC (וקטור בדיקה ידוע), חתימת/אימות JWT, דחיית פג-תוקף.

### 0.3 פרסור מתכון — `src/lib/recipes/parser.ts`
פורט מ-`recipe_service.py` (`get_first_line`, `get_details`) ומלוגיקת הפרסור הקיימת:
טקסט הודעה → `{ title, ingredients[], instructions, categories[] }`. עברית = מקרה הבסיס.
**קבלה**: tests עם 3–4 הודעות מתכון אמיתיות בעברית (לקחת דוגמאות מ-`backend/tests`).

### 0.4 תמונות — `src/lib/images/blob.ts`
העלאה ל-Vercel Blob (`@vercel/blob`), החזרת URL. פונקציה אחת:
`storeTelegramPhoto(fileId): Promise<string|null>` — `getFile` → הורדה → `put()`.
**קבלה**: unit test עם מוקים.

---

## Wave 1 — צד שרת מלא (4 סוכנים במקביל, אחרי Wave 0)

### 1.A Auth routes
`POST /api/auth/login`, `POST /api/auth/guest`, `POST /api/auth/logout`,
`GET /api/auth/validate` — פורט מ-`backend/ourRecipesBack/routes/auth.py`,
**כולל צורת ה-response המדויקת** שה-UI מצפה לה (ראה `src/services/authService.ts`).
בנוסף: `src/middleware.ts` — אימות JWT על כל `/api/**` פרט לרשימת public
(login, guest, webhook, ping, recipes GET ציבורי, menus/shared).
**קבלה**: integration tests — login עם HMAC תקין/שגוי, validate עם/בלי cookie, guest flow.

### 1.B Recipes write + versions
- `POST /api/recipes` (create) ו-`PUT /api/recipes/[telegram_id]` — פורט מ-`routes/recipes.py`:
  DB קודם (כולל `RecipeVersion`), ואז שיקוף לערוץ דרך `botApi` (create → `sendMessage`/`sendPhoto`,
  שמירת `message_id` שחוזר כ-`telegram_id`; update → `editMessageText/Caption`).
  כישלון שיקוף → `sync_status='pending_telegram'`, לא מפיל את הבקשה.
- `POST /api/recipes/bulk` — פורט (פעולות AI על כמה מתכונים).
- `POST /api/recipes/generate-infographic` — פורט מה-route ב-Flask (ה-AI service כבר קיים בנקסט).
- Versions: `GET/POST /api/versions/recipe/[id]`, `POST .../restore/[versionId]`
  (restore = עדכון DB + שיקוף עריכה לערוץ).
**קבלה**: integration tests עם botApi ממוקק — כולל תרחיש "טלגרם נפל" שמוודא שהבקשה מצליחה.

### 1.C Menus write + places
- Menus: `POST /api/menus` (save), `PUT/DELETE /api/menus/[id]`, פעולות meals/recipes בתפריט —
  פורט מ-`routes/menus.py` כולל פורמט ההודעה לערוץ (שיקוף best-effort כמו מתכונים).
- Places: `GET/POST /api/places`, `PUT/DELETE /api/places/[id]` — פורט מ-`routes/places.py`
  (soft delete נשאר; שיקוף best-effort).
**קבלה**: integration tests לכל route; מחיקת menu מוחקת גם את ההודעה (מוקק).

### 1.D Webhook + reconcile + cron
- `POST /api/webhooks/telegram` — הלב של הקלט:
  1. אימות `X-Telegram-Bot-Api-Secret-Token`.
  2. `channel_post`/`edited_channel_post` בלבד; `chat.id` חייב להיות אחד משני הערוצים.
  3. ערוץ ראשי → parser → upsert לפי `message_id`; תוכן זהה ל-DB → no-op (מניעת לולאה);
     תחילית 🗑️ → `status=ARCHIVED`.
  4. ערוץ ישן → Gemini reformat (להשתמש ב-service הקיים) → `sendMessage` לערוץ הראשי →
     upsert עם ה-id החדש.
  5. תמונות דרך `storeTelegramPhoto`. תמיד להחזיר 200 מהר (טלגרם עושה retry על שגיאות).
- `api-python/` (שורש הריפו): FastAPI + Telethon — `POST /reconcile` (השוואת N הודעות
  אחרונות מול ה-DB דרך endpoint פנימי בנקסט, השלמת פערים ושיקופים שנכשלו) +
  `POST /import-history` (עמוד־עמוד עם offset). מוגן ב-`INTERNAL_API_SECRET`.
  פריסה כ-Vercel Python Function (ראה ARCHITECTURE §4.6); חלופה נתמכת: הרצה מקומית.
- `vercel.json`: crons — קריאה יומית ל-reconcile.
**קבלה**: integration tests ל-webhook (הודעה חדשה, עריכה, לולאה, secret שגוי, ערוץ זר, 🗑️).

---

## Wave 2 — חיבור ה-UI וניקוי (2 סוכנים במקביל, אחרי Wave 1)

### 2.A חיתוך ל-Next (cutover)
- `apiService.ts` + `authService.ts`: בסיס ה-URL הופך ל-`''` (relative) — כל הקריאות
  ל-`/api/...` המקומי. מחיקת `NEXT_PUBLIC_API_URL` מכל הקוד וה-env examples.
- הסרת רכיבי/מסכי sync ידני ו-session refresh (ה-UI של "סנכרן עכשיו", סטטוס session
  של Telethon וכו') — לפי המיפוי ב-נספח א'. כפתור סנכרון אחד יכול להישאר אם הוא
  ממופה ל-reconcile הפנימי.
- וידוא שכל צורת response מה-routes החדשים תואמת למה שהרכיבים מפרקים (זה המקום
  שדברים נשברים — לעבור מסך-מסך).
**קבלה**: `npm run build` ירוק; בדיקת עשן ידנית עם `npm run dev` מול DB מקומי:
login guest → חיפוש → פתיחת מתכון → יצירת מתכון (עם botApi ממוקק/סביבת בדיקה) → תפריטים.

### 2.B ניקוי קוד ישן
מחיקה מלאה (הכל בגיט אם נצטרך):
- `backend/` כולו (Flask).
- `telegram_service/` כולו (מוחלף ב-webhook + `api-python/`).
- `docs/refactor/` כולו (מוחלף ב-`docs/architecture/`).
- שורש: `Auth.md`, `PHASE_2_AGENT_PROMPT.md`, `PHASE_4_AGENT_PROMPT.md`,
  `frontend/ourRecipesFront/PHASE_1_COMPLETE.md`.
- `.github/workflows/deploy.yml` (deploy ל-Render) — נמחק, לא מוחלף (Vercel פורס מגיט).
- `docker-compose.yml` — נכתב מחדש מינימלי: postgres מקומי לפיתוח בלבד.
- עדכון `README.md` הראשי: ארכיטקטורה חדשה, הוראות פיתוח (next dev + postgres),
  קישור ל-`docs/architecture/`.
**קבלה**: `grep -ri "render\|flask\|NEXT_PUBLIC_API_URL\|telethon"` בקוד החי (ללא docs)
מחזיר רק את `api-python/`.

---

## Wave 3 — אימות מקצה לקצה (סוכן אחד)

1. `npm run build` + `npx vitest run` — הכל ירוק.
2. סקירה אדוורסרית של ה-diff המלא: כל endpoint שה-UI קורא (נספח א') קיים ותואם צורה.
3. `npx prisma validate` + עדכון סכמה אם נדרש (`image_url` במקום `image_data` בשימוש חדש).
4. עדכון `.env.example` לרשימה הסופית (ARCHITECTURE §7).
5. כתיבת `docs/architecture/DEPLOYMENT.md`: צעדי ההפעלה החד-פעמיים —
   יצירת DB, `prisma db push`, יבוא היסטוריה, `setWebhook` (עם `allowed_updates` +
   `secret_token`), צירוף הבוט כאדמין לשני הערוצים, הגדרת env ב-Vercel, כיבוי Render.

---

## נספח א' — מלאי ה-API שה-UI צורך (הפער למימוש)

מבוסס על סריקה מלאה של `src` (2026-08-25). ✅ = route קיים בנקסט; ❌ = חסר;
⚠️ = קיים אבל בנתיב/צורה שונים — ליישר בצד ה-client בזמן ה-cutover.

### Auth — הכל ❌
`POST /auth/login`, `POST /auth/guest`, `POST /auth/logout`, `GET /auth/validate`.
ה-UI (דרך `authService`) שומר גם token ב-`localStorage` ושולח `Authorization: Bearer`
כ-fallback ל-iOS — **לשמר את המנגנון הזה**: ה-routes החדשים צריכים לקבל JWT גם מ-cookie
וגם מ-header, ולהחזיר `token` בגוף התשובה של login/guest.

### Recipes
| שימוש ב-UI | סטטוס |
|---|---|
| `GET /recipes/{id}` | ✅ `/api/recipes/[telegram_id]` |
| `GET /recipes/search`, `GET /recipes/search/suggestions` | ✅ |
| `GET /recipes/manage` | ✅ |
| `POST /recipes/suggest`, `refine`, `optimize-steps`, `generate-image` | ✅ |
| `POST /recipes/reformat_recipe` | ⚠️ קיים כ-`/api/recipes/reformat` — ליישר את ה-client |
| `PUT /recipes/update/{id}` **וגם** `PUT /recipes/{id}` (שתי צורות ב-UI!) | ❌ — לממש `PUT /api/recipes/[telegram_id]` אחד וליישר את כל קריאות ה-UI אליו |
| `POST /recipes` (create) + `POST /send_recipe` (שמירת הצעת AI) | ❌ — לממש `POST /api/recipes` אחד; `send_recipe` מתמזג לתוכו |
| `POST /recipes/bulk` | ❌ |
| `POST /recipes/generate-infographic` | ❌ (route חסר בנקסט למרות שה-AI service קיים) |

### Versions — הכל ❌
ה-UI קורא: `GET /versions/recipe/{recipeId}`,
`POST /versions/recipe/{telegram_id}/restore/{versionId}`.

### Categories
`GET /categories` ✅ (זה כל מה שה-UI צורך).

### Places — הכל ❌
`GET/POST /places`, `PUT/DELETE /places/{id}` (בשימוש מלא ב-`places/page.tsx`).

### Menus
| שימוש ב-UI | סטטוס |
|---|---|
| `GET /menus`, `GET /menus/{id}`, `GET /menus/shared/{token}` | ✅ |
| `POST /menus/generate-preview` | ✅ |
| shopping-list: get / regenerate / item PATCH | ✅ (⚠️ ה-client קורא `/menus/shopping-list/items/{id}` וה-route בנקסט הוא `/api/shopping-list/items/[id]` — ליישר client) |
| `POST /menus/save` | ❌ |
| `PUT /menus/{id}`, `DELETE /menus/{id}` | ❌ (route קיים עם GET בלבד) |
| meals: `POST /menus/{id}/meals`, `DELETE .../meals/{mealId}`, `POST/PUT/DELETE .../recipes...`, `GET .../suggestions` | ❌ (6 פעולות) |

### Sync — נמחק, לא ממומש
`GET /sync/status`, `GET/POST /sync/session/*`, `POST /sync`, `POST /sync/full` —
לא מקבלים מקבילה. ה-UI שלהם מוסר (ראה Wave 2.A): `SyncStatus.tsx`,
`handleSync` ב-`layout/Header.tsx`, השימוש ב-`manage/page.tsx`, `syncService.ts`.

### הערות חיתוך קריטיות (Wave 2.A)
1. **קריאות fetch ישירות שעוקפות את apiService** (משתמשות ב-`NEXT_PUBLIC_API_URL`
   ישירות, חלקן בלי Authorization header): `RecipeEditForm`, `RecipeStepOptimizer`,
   `RecipeDetails`, `RecipeManagement`, `RecipeModal`, `MealSuggestionForm`,
   `VersionHistory`, `management/RecipeList`, `management/RecipeGrid` —
   **לנתב את כולן דרך `apiService`** בזמן ה-cutover (מתקן גם את באג ה-auth ב-iOS).
2. `recipeService.getRecipeByIdWithRetry` — לוגיקת retry ל"שרת ישן" (Render כבוי,
   עד 2 דקות) — להסיר; אין יותר cold-start של דקות.
3. מתודות service ללא call sites (רשימה מלאה בפלט הסריקה) — למחוק אגב נגיעה בקבצים.

---

## נספח ב' — קבצי מקור לפורט

| נושא | קובץ Flask |
|------|-----------|
| Auth + HMAC + JWT | `backend/ourRecipesBack/services/auth_service.py`, `routes/auth.py` |
| Recipes CRUD + parsing | `backend/ourRecipesBack/services/recipe_service.py`, `routes/recipes.py` |
| Menus + שיקוף לערוץ | `backend/ourRecipesBack/services/menu_service.py`, `routes/menus.py` |
| Places | `backend/ourRecipesBack/routes/places.py` |
| Versions | `backend/ourRecipesBack/routes/versions.py` |
| בדיקת הרשאות בערוץ | `backend/ourRecipesBack/services/telegram_service.py` (`check_permissions`) |
| פורמט הודעות | `telegram_service/utils/formatters.py` (אם קיים תוכן רלוונטי) |
| Telethon ליבוא | `telegram_service/telegram_client.py`, `main.py` (`sync-messages`) |

---

## נספח ג' — פערים ידועים שנותרו (סוף Wave 3)

נסקר לראשונה ב-2026-08-25 בסריקה האדוורסרית של Wave 3. עודכן באותו יום, אחרי
סבב תיקונים שסגר את כל הפערים שתועדו כאן חוץ מהחלטת מוצר אחת (שאינה חוב טכני).

**נסגרו מאז הסקירה המקורית:**

| # | פער (כפי שתועד ב-Wave 3) | סטטוס |
|---|------|--------|
| 1 | `GET /api/menus` ו-`GET /api/menus/:id` לא סיננו לפי בעלות. | **טופל** — קריאת תפריטים אוכפת בעלות (`user_id`) כמו הכתיבות. |
| 2 | `PATCH/PUT/DELETE /api/shopping-list/items/:id` לא בדקו שהפריט שייך לתפריט של המשתמש. | **טופל** — הראוטים מאמתים בעלות דרך התפריט לפני עדכון/מחיקה. |
| 3 | `HUGGINGFACE_TOKEN` ו-`NEXT_PUBLIC_TELEGRAM_BOT` (וגם `CRON_SECRET`, `PYTHON_RECONCILE_URL`, `LOG_LEVEL`) בשימוש בקוד אך לא הופיעו ב-ARCHITECTURE §7. | **טופל** — כל המשתנים תועדו ב-ARCHITECTURE §7. |
| 4 | `Recipe.image_data` / `RecipeVersion.image_data` נשארו בסכמה כעמודות legacy קריאה-בלבד. | **טופל** — העמודות הוסרו לגמרי מ-`prisma/schema.prisma`; כל שימוש בקוד (כולל fallback-ים ל-`hadImage`) עודכן לעבוד רק מול `image_url`. |

**נשאר — החלטת מוצר מתועדת, לא חוב טכני:**

ה-routes של ה-AI (`suggest`, `refine`, `optimize-steps`, `reformat`,
`generate-image`) דורשים session אך לא הרשאת עריכה (`src/app/api/recipes/*`).
זו **החלטה מכוונת**: אורחים רשאים להשתמש בפיצ'רי AI לקריאה-בלבד (הצעות,
ליטוש טקסט, וכו'); כל **כתיבה** בפועל (עדכון/יצירת מתכון, שמירת תמונה על
הרשומה) עדיין דורשת `requireEditPermission`. `generate-infographic` דורש
`requireAuth` בלבד, לפי אותה הכרעה. אין כאן פער לתקן.

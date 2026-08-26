# 🏗️ Our Recipes — ארכיטקטורת היעד

**תאריך**: 2026-08-25 · **עודכן**: 2026-08-26 (Wave 5 — "ערוץ אחד, מקור אחד")
**סטטוס**: ✅ מאושר — מחליף את `docs/refactor/` (התוכנית הישנה)
**מסמך אחות**: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — תוכנית המימוש המלאה

> **Wave 5 בקצרה**: הערוץ הראשי — שנוצר בזמנו כ"מסד נתונים" לפני שהיה DB —
> מבוטל ונמחק. נשאר ערוץ אחד: **הערוץ הישן**, מקור הטקסט החופשי שאנשים באמת
> כותבים בו. האפליקציה רק מושכת ממנו (webhook + reconcile) ולא כותבת לשום
> ערוץ; כל מתכון נושא `{source_channel, source_message_id}` כך שעריכה בערוץ
> מתמפה חד־חד-ערכית לשורה שלה. שכבת השיקוף (mirror) נמחקה כליל.

---

## 1. הבעיה שהמסמך הזה פותר

הארכיטקטורה ההיסטורית התייחסה ל**ערוץ הטלגרם כ-source of truth**: ה-DB היה רק
cache מסונכרן, שרץ כ-SQLite על דיסק ארעי ב-Render free tier. התוצאות:

- כל ריסטארט של Render מחק את ה-DB → סנכרון מלא ואיטי מטלגרם מחדש.
- מנגנון sync מורכב (polling עם Telethon) שדרש שרת ארוך־חיים.
- כתיבות לטלגרם ישבו בנתיב הקריטי של כל בקשת עריכה.
- שלושה רכיבי backend במקביל (Flask, telegram_service, Next API routes) — שניים מהם ללא משתמשים.

## 2. ההכרעה המרכזית

> **PostgreSQL מנוהל הוא ה-source of truth היחיד. טלגרם הוא ממשק קלט ותצוגה —
> לא הזיכרון של המערכת.**

מרגע שמתכון נקלט ב-DB, טלגרם סיים את תפקידו לגביו. אין יותר "סנכרון מלא",
אין שחזור אחרי מחיקת DB (כי ה-DB לא נמחק — זו העבודה של ספק ה-DB המנוהל).

## 3. תמונת המערכת

```
                      ┌──────────────────────────────────────────────┐
  ערוץ טלגרם ישן      │  Vercel                                      │
  (המקור הגולמי —      │  ┌────────────────────────────────────────┐  │
   קלט בלבד)           │  │ Next.js — UI + API Routes (TypeScript) │  │     PostgreSQL מנוהל
       │ webhook       │  │  /api/webhooks/telegram                │  │     (Neon)
       └─────────────► │  │    channel_post / edited_channel_post  │──┼──►  ★ source of truth ★
   channel_post        │  │  /api/recipes|menus|places|auth|...    │  │
   edited_channel_post │  └────────────────────────────────────────┘  │          ▲
       ▲               │  ┌────────────────────────────────────────┐  │          │
       │ קריאת         │  │ Python Function (FastAPI + Telethon)   │──┼──────────┘
       │ היסטוריה      │  │  reconcile + rebuild מהיסטוריית הערוץ  │  │
       └───────────────┼──┘                                        │  │     Vercel Blob
                      │  Vercel Cron ──► reconcile (רשת ביטחון)     │     (תמונות מתכונים)
                      └──────────────────────────────────────────────┘
```

אין חצים חוזרים אל טלגרם: האפליקציה לא כותבת לשום ערוץ. הראווה היא
האפליקציה עצמה.

### הרכיבים

| רכיב | טכנולוגיה | תפקיד |
|------|-----------|-------|
| **אפליקציה** | Next.js על Vercel | UI + כל ה-API (CRUD, AI, Auth) — TypeScript, Prisma |
| **DB** | PostgreSQL מנוהל | source of truth. לעולם לא נמחק |
| **תמונות** | Vercel Blob | קבצי תמונה; ב-DB נשמר URL בלבד (לא `Bytes`) |
| **קלט מטלגרם** | Bot API **webhook** | טלגרם דוחף פוסטים/עריכות מהערוץ הישן ל-route בנקסט. אפס polling |
| **פלט לטלגרם** | — | אין. שכבת השיקוף נמחקה ב-Wave 5; Bot API משמש רק ל-webhook, `getChatMember` ואימות login |
| **AI** | Gemini SDK ב-Node | ניסוח/עיצוב מתכונים (כל קליטה מהערוץ עוברת reformat), הצעות, תפריטים |
| **Telethon** | Python Function על Vercel (או ריצה מקומית) | רק מה ש-Bot API לא יכול: קריאת היסטוריית הערוץ הישן. reconcile תקופתי; אותו endpoint עם caps מוגדלים = ה-rebuild המלא |
| **תזמון** | Vercel Cron | קריאת reconcile יומית (רשת ביטחון, לא מנגנון מרכזי) |

### מה נמחק

- ❌ **שרת Render** — אין יותר שרת ארוך־חיים בכלל.
- ❌ **`backend/` (Flask)** — כל 59 ה-endpoints עוברים ל-Next (רובם כבר קיימים).
- ❌ **`telegram_service/` (FastAPI microservice עצמאי)** — מוחלף ב-webhook + Python Function על Vercel.
- ❌ **מנגנון ה-sync בכללותו** (routes, כפתורי UI, session refresh) — אין מה לסנכרן כשה-DB הוא המקור.
- ❌ **`.github/workflows/deploy.yml`** (build+deploy ל-Render), **`docker-compose.yml`** במתכונתו הנוכחית.
- ❌ **הערוץ הראשי ושכבת השיקוף** (Wave 5) — `mirror.ts`, `mirrorPending.ts`,
  `menuMirror.ts`, `placeMirror.ts`, `/api/internal/mirror-pending`. הערוץ
  הראשי היה ה"מסד נתונים" של עידן טרום-Postgres; משיש DB אמיתי, עותק שני
  שחייבים לתחזק בכתיבה כפולה הוא רק מקור לבאגים. הערוץ נמחק גם בטלגרם עצמו.

## 4. הזרימות המרכזיות

### 4.1 מתכון חדש נשלח לערוץ (הזרימה שבגללה הכל קיים)

1. משתמש (אדמין של הערוץ הישן) שולח מתכון בטקסט חופשי לערוץ.
2. טלגרם שולח `channel_post` ל-`POST /api/webhooks/telegram` (מאומת ב-`secret_token`).
3. ה-handler בודק אם שורה כבר תובעת את `{source_channel:'old', source_message_id}`
   (זה גם מה שהופך redelivery של טלגרם לאידמפוטנטי):
   - **אין שורה**: Gemini מנסח ומעצב בזיכרון → נשמר ישירות ב-Postgres תחת
     `telegram_id` פנימי שלילי (שנשאר מפתח ה-URL הציבורי `/recipe/<id>`),
     עם צמד המקור ו-`created_at` = זמן הפרסום המקורי.
   - **יש שורה**: זו עריכה — ראו 4.2.
4. שום דבר לא מתפרסם חזרה לשום ערוץ. הראווה היא האפליקציה.

**זמן מקצה לקצה: שניות, אוטומטי לחלוטין, בלי שום שרת משלנו שרץ.**

### 4.2 עריכת הודעה בערוץ

טלגרם שולח `edited_channel_post` (חובה לכלול אותו ב-`allowed_updates` של
`setWebhook`). ההודעה ממופה לשורה שלה דרך צמד המקור — לא דרך `telegram_id`,
שמנותק ממזהי ההודעות מאז Wave 5.

- **הערוץ מנצח**: Gemini מנסח מחדש, התוכן הקודם נשמר כ-`RecipeVersion`
  (`created_by='old_channel'`), והשורה נדרסת.
- **קונפליקט**: אם המתכון נערך בינתיים גם באפליקציה (`app_edited_at` עדכני),
  הדריסה קורית *וגם* `needs_review=true` — הקונפליקט מוצג במסך הניהול
  במקום להתגלות בעוד חודש.
- reformat שיצא זהה לתוכן השמור — no-op.
- אין יותר צורך במניעת לולאה: האפליקציה לא כותבת לערוץ, אז אין echo.

### 4.3 יצירה/עריכה מתוך האפליקציה

1. כתיבה ל-DB (טרנזקציה, כולל `RecipeVersion`) — וזהו. אין שיקוף, אין
   `sync_status`, אין תלות רשת בטלגרם בנתיב הכתיבה.
2. נתיבי העריכה (update, שחזור גרסה) מטביעים `app_edited_at` ומנקים
   `needs_review` — זה הבסיס לזיהוי קונפליקטים של 4.2.
3. מתכון שנוצר באפליקציה מקבל `telegram_id` פנימי שלילי ו-`source_channel='app'`
   (בלי `source_message_id` — אין הודעת מקור).

### 4.4 מחיקה — המגבלה האחת של Bot API

טלגרם **לא שולח webhook על מחיקת הודעה**, ואין דרך לבוט לגלות שהודעה נעלמה.

- מחיקה **דרך האפליקציה**: `status=ARCHIVED` ב-DB. לא נוגעת בערוץ.
- "מחיקה" בערוץ: הקונבנציה היא לערוך את ההודעה ולהוסיף 🗑️ בתחילתה במקום
  למחוק — ה-handler מזהה את הסימון ומארכב את השורה (בלי קריאת AI); עריכה
  מאוחרת שמסירה את הסימון מחזירה את המתכון לחיים. הודעה שנמחקת פיזית פשוט
  לא מגיעה לאפליקציה — השורה נשארת כמו שהיא.

**מחיקה היא רכה — ולכן היא שווה בדיוק כמה שהקוראים מכבדים אותה.** השורה נשארת
ב-DB (`Recipe.status='ARCHIVED'`, `Place.is_deleted=true`), כך ש"נמחק" הוא כלל
קריאה, לא מצב פיזי. הכלל מוגדר במקום אחד לכל ישות ואסור לשכפל אותו ב-`where`
של route:

| ישות   | מנגנון                | הכלל היחיד                                          |
| ------ | --------------------- | --------------------------------------------------- |
| מתכון  | `status='ARCHIVED'`   | `VISIBLE_RECIPE` / `PLANNABLE_RECIPE` ב-`lib/recipes/visibility.ts` |
| מקום   | `is_deleted=true`     | `VISIBLE_PLACE` ב-`lib/places/visibility.ts`         |
| תפריט  | מחיקה קשה (`menu.delete`) | אין צורך — השורה לא קיימת                        |

`PLANNABLE_RECIPE` = `VISIBLE_RECIPE` + `is_parsed` — מה שסוכן התפריטים ו-MCP
מותר להם לראות. הוא חייב לחול גם על נתיבי ה-**כתיבה** שמקבלים `recipe_id` מבחוץ
(`buildMenuPreview`, שמירת תפריט, הוספת מתכון לארוחה), כי מזהה שהמודל המציא אינו
מגיע מכלי חיפוש ולכן לא עבר שום סינון. החריג היחיד המכוון: `/api/recipes/manage`,
שכל תפקידו להראות מה אורכב.

### 4.5 Auth

נשאר Telegram, עובר לנקסט:

1. **Login**: Telegram Login Widget → `POST /api/auth/login` → אימות HMAC-SHA256
   (מפתח = `sha256(BOT_TOKEN)`) → JWT ב-httpOnly cookie (חתימה עם `jose`, 7 ימים).
2. **הרשאות עריכה**: `getChatMember(chat, user)` על **הערוץ הישן** — המשתמש
   חייב להיות `creator` או `administrator` שם. הרציונל: רק אדמינים יכולים
   לפרסם מתכונים לערוץ, אז "מי שרשאי לכתוב למקור" הוא הרף; `can_edit_messages`
   כבר לא רלוונטי כי עריכה היא כתיבת DB, לא עריכת הודעה. נשמר ב-cache שעה.
3. **Guest**: JWT עם `guest_<uuid>`, ללא הרשאות עריכה.
4. Middleware בנקסט מאמת JWT על כל route שאינו ציבורי. **כרגע ה-routes בנקסט
   פתוחים לגמרי — סגירת זה היא תנאי לחיבור ה-UI.**

### 4.6 reconcile ו-rebuild (המקום היחיד של Telethon)

Bot API לא רואה הודעות מלפני צירוף הבוט. לכן:

- **Reconcile תקופתי**: Vercel Cron → Python Function (FastAPI + Telethon,
  session string, מתחבר פר-הפעלה) → סורק את N ההודעות האחרונות בערוץ הישן →
  כל הודעה שאין שורה שתובעת את ה-`source_message_id` שלה נשלחת ל-
  `POST /api/internal/old-channel/ingest` (אותו צינור reformat של ה-webhook).
  אין השוואת טקסט: התוכן השמור הוא reformat של Gemini ולעולם לא ישווה לטקסט
  הגולמי — "השורה קיימת" הוא האות היחיד. כל miss עולה קריאת Gemini, ולכן
  `RECONCILE_INGEST_LIMIT` מגביל כמה מהם נסגרים בריצה; השאר בריצה הבאה.
- **Rebuild מלא**: אותו `POST /reconcile` עם `limit` ו-`ingest_limit`
  מוגדלים, בריצה מקומית (docker-compose) — אין endpoint נפרד.

**למה זה אפשרי על Vercel**: Vercel מריצים כיום ASGI/WSGI מלא (FastAPI/Flask/Django,
Python 3.12–3.14) כ-Functions, כולל Fluid compute ו-**Services** — פרויקט אחד
שמשלב Next.js + Python תחת דומיין אחד. Telethon עם `StringSession` מתחבר
פר-הפעלה (1–3 שניות) — מקובל לחלוטין לעבודת batch תקופתית. מה שעדיין
**אי אפשר** על Vercel: daemon קבוע שמאזין לערוץ 24/7 — וזה בסדר, כי ההאזנה
השוטפת עוברת ל-webhook של Bot API.

## 5. החלטות ונימוקים

| # | החלטה | חלופה שנדחתה | נימוק |
|---|--------|---------------|--------|
| 1 | Postgres = source of truth | טלגרם = מקור, DB = cache | מבטל את כל מנגנון הסנכרון, את התלות בשרת קבוע ואת שבירות ה-free tier |
| 2 | קלט בזמן אמת: Bot API webhook | polling עם Telethon | push במקום pull; עובד serverless; אפס תחזוקה |
| 3 | ~~פלט לטלגרם: `fetch` ל-Bot API~~ בוטל ב-Wave 5 — אין פלט לטלגרם | להמשיך לשקף לערוץ הראשי | עותק שני שמתוחזק בכתיבה כפולה הוא מקור לבאגים בלי קוראים אמיתיים; הראווה היא האפליקציה |
| 4 | Telethon נשאר רק ל-reconcile/rebuild, כ-Python Function על Vercel | להיפטר מ-Telethon לגמרי / להשאיר microservice ב-Railway | Bot API לא קורא היסטוריה — Telethon הכרחי לזה; Vercel Python runtime מייתר שרת חיצוני |
| 5 | תמונות ב-Vercel Blob, לא ב-DB | `image_data Bytes` ב-Postgres | free tier של Postgres קטן (מאות MB); Blob זול, עם CDN |
| 6 | Auth תוצרת בית עם `jose` (אותו flow כמו Flask) | NextAuth.js | ה-flow של Login Widget + JWT cookie הוא ~150 שורות; NextAuth מוסיף שכבת מושגים בלי צורך אמיתי |
| 7 | מחיקת Flask ו-telegram_service מהריפו | להשאיר "ליתר ביטחון" | הקוד בגיט להיסטוריה; שני backends חיים = בלבול ובאגים |
| 8 | (Wave 5) ערוץ אחד: הישן הוא המקור, הראשי נמחק; זהות מקור = `{source_channel, source_message_id}` | להשאיר את הראשי כראווה; מיפוי לפי `telegram_id` | מזהי הודעות הם פר-ערוץ, אז רק הצמד חד-משמעי; `telegram_id` משתחרר להיות מפתח URL פנימי; עריכה בערוץ מתמפה לשורה שלה במקום להידרס או להתפצל |
| 9 | (Wave 5) קונפליקט עריכה: הערוץ מנצח + `needs_review` | app-wins / last-write-wins שקט | הערוץ הוא המקור החברתי; דריסה שקטה של עריכת אפליקציה היא אובדן מידע — הדגל מציף אותה במסך הניהול, וה-`RecipeVersion` שומר את מה שנדרס |

## 6. אבטחה

- **Webhook**: `setWebhook` עם `secret_token`; ה-handler דוחה כל בקשה שבה
  ה-header `X-Telegram-Bot-Api-Secret-Token` לא תואם. בנוסף נבדק ש-`chat.id`
  הוא הערוץ הישן (עד מחיקת הערוץ הראשי בטלגרם, פוסט ממנו עדיין מזוהה —
  ונענה ב-ignore).
- **JWT**: httpOnly, Secure, SameSite=Lax. אותם claims כמו היום (`user_id`,
  `permissions.can_edit`, `auth_type`).
- **Python Function**: מוגן ב-Bearer token פנימי (`INTERNAL_API_SECRET`) — נקרא רק
  מ-Cron / מהאפליקציה.
- **Bot token** לעולם לא מגיע לצד לקוח.

## 7. משתני סביבה (מצב סופי)

```env
# Next.js (Vercel)
DATABASE_URL=postgresql://...
JWT_SECRET=...                      # חתימת JWT (מחליף SECRET_JWT)
TELEGRAM_BOT_TOKEN=...              # Bot API: webhook, שיקוף, getChatMember, אימות login
TELEGRAM_WEBHOOK_SECRET=...         # secret_token של setWebhook
TELEGRAM_OLD_CHANNEL_ID=-100xxxxxxx # הערוץ הישן — הערוץ היחיד: קלט, הרשאות (getChatMember)
# TELEGRAM_CHANNEL_ID — בדרך החוצה: נקרא רק כדי לזהות (ולהתעלם מ)פוסטים מהערוץ
# הראשי הקפוא; נמחק סופית יחד עם הערוץ עצמו (שלב 5.7)
NEXT_PUBLIC_TELEGRAM_BOT=...        # שם הבוט (ללא @) — data-telegram-login של TelegramLoginWidget, נחשף לצד לקוח
GOOGLE_API_KEY=...                  # Gemini
GOOGLE_API_KEY_NANO_BANANA=...      # תמונות
HUGGINGFACE_TOKEN=...               # generateRecipeImage (Stable Diffusion XL, /api/recipes/generate-image)
BLOB_READ_WRITE_TOKEN=...           # Vercel Blob
INTERNAL_API_SECRET=...             # קריאות פנימיות (cron→python, python→next)
CRON_SECRET=...                     # Bearer שה-Vercel Cron שולח ל-/api/cron/*; INTERNAL_API_SECRET מתקבל גם הוא כחלופה
PYTHON_RECONCILE_URL=...            # אופציונלי: כתובת ה-Python Function; ללא זה מדלגים על מעבר ה-reconcile ההיסטורי (§4.6)
LOG_LEVEL=...                       # אופציונלי: רמת ה-pino logger (ברירת מחדל: debug בפיתוח, info בפרודקשן)

# Python Function (reconcile/rebuild בלבד)
TELEGRAM_API_ID=... / TELEGRAM_API_HASH=... / SESSION_STRING=...
TELEGRAM_OLD_CHANNEL_ID=...         # (+TELEGRAM_OLD_CHANNEL_URL אופציונלי כ-fallback)
INTERNAL_API_SECRET=...             # כל הכתיבה דרך ה-API הפנימי של נקסט — אין DATABASE_URL
RECONCILE_INGEST_LIMIT=20           # תקרת קריאות Gemini פר ריצה; מוגדל ל-rebuild
```

נעלמים לתמיד: `SESSION_STRING_MONITOR`, `ORIGIN_CORS` (אין יותר cross-origin),
כל קונפיגורציית Flask/Render.

## 8. מה נשאר בכוונה

- **מבנה ה-DB** — סכמת ה-Prisma הקיימת (10 מודלים) נשארת, בשינויים קטנים:
  עמודת ה-`image_data` (Bytes legacy) הוסרה לגמרי מ-`Recipe` ומ-`RecipeVersion`
  לטובת `image_url` בלבד. מאז Wave 5 `sync_status`/`sync_error` (וגם
  `Menu.telegram_message_id`, `Place.is_synced`) הן עמודות רדומות — אף קוד לא
  כותב אליהן; נשארות כי אין תשתית migrations והסרה אינה שווה את הסיכון.
  נוספו: `source_channel`+`source_message_id` (unique יחד — זהות המקור),
  `needs_review`, `app_edited_at`.
- **ה-UI** — לא משתנה פונקציונלית; רק יעד ה-API מתחלף (Flask → relative `/api`)
  ורכיבי sync ידני מוסרים.
- **ה-AI routes** שכבר נכתבו בנקסט (suggest, reformat, refine, generate-image,
  menus/generate-preview) — נשארים כמו שהם.

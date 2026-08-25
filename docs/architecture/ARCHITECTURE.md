# 🏗️ Our Recipes — ארכיטקטורת היעד

**תאריך**: 2026-08-25
**סטטוס**: ✅ מאושר — מחליף את `docs/refactor/` (התוכנית הישנה)
**מסמך אחות**: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — תוכנית המימוש המלאה

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
  ערוץ טלגרם ראשי     │  Vercel                                      │
  (קלט + ראווה)       │  ┌────────────────────────────────────────┐  │
       │               │  │ Next.js — UI + API Routes (TypeScript) │  │
       │ webhook       │  │                                        │  │     PostgreSQL מנוהל
       └─────────────► │  │  /api/webhooks/telegram                │  │     (Neon / Supabase /
   channel_post        │  │    channel_post / edited_channel_post  │──┼──►  Vercel Postgres)
   edited_channel_post │  │  /api/recipes|menus|places|auth|...    │  │     ★ source of truth ★
       ▲               │  │  Bot API client (fetch בלבד)           │  │
       │ sendMessage   │  └────────────────────────────────────────┘  │          ▲
       │ editMessage   │  ┌────────────────────────────────────────┐  │          │
  ערוץ ישן ────────────┼─►│ Python Function (FastAPI + Telethon)   │──┼──────────┘
  (מקור גולמי)         │  │  יבוא היסטוריה חד־פעמי + reconcile     │  │
                      │  └────────────────────────────────────────┘  │     Vercel Blob
                      │  Vercel Cron ──► reconcile (רשת ביטחון)     │     (תמונות מתכונים)
                      └──────────────────────────────────────────────┘
```

### הרכיבים

| רכיב | טכנולוגיה | תפקיד |
|------|-----------|-------|
| **אפליקציה** | Next.js על Vercel | UI + כל ה-API (CRUD, AI, Auth) — TypeScript, Prisma |
| **DB** | PostgreSQL מנוהל | source of truth. לעולם לא נמחק |
| **תמונות** | Vercel Blob | קבצי תמונה; ב-DB נשמר URL בלבד (לא `Bytes`) |
| **קלט מטלגרם** | Bot API **webhook** | טלגרם דוחף הודעות חדשות/ערוכות ל-route בנקסט. אפס polling |
| **פלט לטלגרם** | Bot API דרך `fetch` | שיקוף מתכונים שנוצרו/נערכו באפליקציה אל הערוץ. fire-and-forget |
| **AI** | Gemini SDK ב-Node | ניסוח/עיצוב מתכונים, הצעות, תפריטים (כבר ממומש ב-Next) |
| **Telethon** | Python Function על Vercel (או ריצה מקומית) | רק מה ש-Bot API לא יכול: קריאת היסטוריית ערוץ. יבוא חד־פעמי + reconcile תקופתי |
| **תזמון** | Vercel Cron | קריאת reconcile יומית (רשת ביטחון, לא מנגנון מרכזי) |

### מה נמחק

- ❌ **שרת Render** — אין יותר שרת ארוך־חיים בכלל.
- ❌ **`backend/` (Flask)** — כל 59 ה-endpoints עוברים ל-Next (רובם כבר קיימים).
- ❌ **`telegram_service/` (FastAPI microservice עצמאי)** — מוחלף ב-webhook + Python Function על Vercel.
- ❌ **מנגנון ה-sync בכללותו** (routes, כפתורי UI, session refresh) — אין מה לסנכרן כשה-DB הוא המקור.
- ❌ **`.github/workflows/deploy.yml`** (build+deploy ל-Render), **`docker-compose.yml`** במתכונתו הנוכחית.

## 4. הזרימות המרכזיות

### 4.1 מתכון חדש נשלח לערוץ (הזרימה שבגללה הכל קיים)

1. משתמש שולח מתכון לערוץ (הראשי או הישן).
2. טלגרם שולח `channel_post` ל-`POST /api/webhooks/telegram` (מאומת ב-`secret_token`).
3. ה-handler:
   - **מהערוץ הישן**: Gemini מנסח ומעצב → הבוט מפרסם את הגרסה המסודרת בערוץ הראשי → נשמר ב-DB עם ה-`message_id` החדש.
   - **מהערוץ הראשי**: פרסור (כותרת/רכיבים/הוראות) → upsert ב-DB לפי `telegram_id = message_id`.
4. תמונה? הורדה דרך `getFile` (עד 20MB) → העלאה ל-Vercel Blob → URL ב-DB.

**זמן מקצה לקצה: שניות, אוטומטי לחלוטין, בלי שום שרת משלנו שרץ.**

### 4.2 עריכת הודעה בערוץ

טלגרם שולח `edited_channel_post` (חובה לכלול אותו ב-`allowed_updates` של
`setWebhook`). אותו upsert לפי `message_id`.

**מניעת לולאה**: כשהאפליקציה עצמה עורכת דרך הבוט, ה-webhook על העריכה יחזור
אלינו. ה-handler משווה תוכן נכנס מול ה-DB — זהה? מתעלם.

### 4.3 יצירה/עריכה מתוך האפליקציה

1. כתיבה ל-DB (טרנזקציה, כולל `RecipeVersion`).
2. התשובה למשתמש חוזרת **מיד** — ה-DB הוא המקור.
3. שיקוף לערוץ דרך Bot API (`sendMessage`/`editMessageText`) — best-effort:
   נכשל? נרשם `sync_status='pending_telegram'` וה-reconcile ישלים. טלגרם נפל ≠ האפליקציה נפלה.

### 4.4 מחיקה — המגבלה האחת של Bot API

טלגרם **לא שולח webhook על מחיקת הודעה**, ואין דרך לבוט לגלות שהודעה נעלמה.

- מחיקה **דרך האפליקציה**: DB → `deleteMessage` בערוץ. עובד מלא.
- מחיקה ידנית בערוץ: לא תגיע לאפליקציה. קונבנציה: לערוך את ההודעה ולהוסיף 🗑️
  בתחילתה במקום למחוק — ה-handler של העריכה מסמן `status=ARCHIVED`.
- ה-reconcile (Telethon) מזהה פערים כאלה בדיעבד.

### 4.5 Auth

נשאר Telegram, עובר לנקסט:

1. **Login**: Telegram Login Widget → `POST /api/auth/login` → אימות HMAC-SHA256
   (מפתח = `sha256(BOT_TOKEN)`) → JWT ב-httpOnly cookie (חתימה עם `jose`, 7 ימים).
2. **הרשאות עריכה**: `getChatMember(chat, user)` ב-Bot API — המשתמש חייב להיות
   **אדמין עם `can_edit_messages`** בערוץ (שקילות מלאה ל-`permissions.is_admin and
   permissions.edit_messages` שהיה ב-Telethon). נשמר ב-cache שעה (כמו היום).
3. **Guest**: JWT עם `guest_<uuid>`, ללא הרשאות עריכה.
4. Middleware בנקסט מאמת JWT על כל route שאינו ציבורי. **כרגע ה-routes בנקסט
   פתוחים לגמרי — סגירת זה היא תנאי לחיבור ה-UI.**

### 4.6 יבוא היסטוריה ו-reconcile (המקום היחיד של Telethon)

Bot API לא רואה הודעות מלפני צירוף הבוט. לכן:

- **יבוא חד־פעמי**: סקריפט Telethon (`iter_messages` על כל הערוץ) → upsert ל-Postgres.
  רץ פעם אחת — מקומית או כ-Python Function.
- **Reconcile תקופתי**: Vercel Cron → Python Function (FastAPI + Telethon,
  session string, מתחבר פר-הפעלה) → משווה N ההודעות האחרונות מול ה-DB →
  משלים פערים ומריץ שיקופים שנכשלו (`pending_telegram`).

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
| 3 | פלט לטלגרם: `fetch` ל-Bot API בטייפסקריפט | ספריית bot (grammY/telegraf) או Python | נדרשות 4 קריאות HTTP פשוטות (send/edit/delete/getFile) — ספרייה שלמה או שפה שנייה הן overkill בנתיב הזה |
| 4 | Telethon נשאר רק ליבוא/reconcile, כ-Python Function על Vercel | להיפטר מ-Telethon לגמרי / להשאיר microservice ב-Railway | Bot API לא קורא היסטוריה — Telethon הכרחי לזה; Vercel Python runtime מייתר שרת חיצוני |
| 5 | תמונות ב-Vercel Blob, לא ב-DB | `image_data Bytes` ב-Postgres | free tier של Postgres קטן (מאות MB); Blob זול, עם CDN |
| 6 | Auth תוצרת בית עם `jose` (אותו flow כמו Flask) | NextAuth.js | ה-flow של Login Widget + JWT cookie הוא ~150 שורות; NextAuth מוסיף שכבת מושגים בלי צורך אמיתי |
| 7 | מחיקת Flask ו-telegram_service מהריפו | להשאיר "ליתר ביטחון" | הקוד בגיט להיסטוריה; שני backends חיים = בלבול ובאגים |

## 6. אבטחה

- **Webhook**: `setWebhook` עם `secret_token`; ה-handler דוחה כל בקשה שבה
  ה-header `X-Telegram-Bot-Api-Secret-Token` לא תואם. בנוסף נבדק ש-`chat.id`
  הוא אחד משני הערוצים המוכרים.
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
TELEGRAM_CHANNEL_ID=-100xxxxxxxxxx  # הערוץ הראשי
TELEGRAM_OLD_CHANNEL_ID=-100xxxxxxx # הערוץ הישן (קלט גולמי)
GOOGLE_API_KEY=...                  # Gemini
GOOGLE_API_KEY_NANO_BANANA=...      # תמונות
BLOB_READ_WRITE_TOKEN=...           # Vercel Blob
INTERNAL_API_SECRET=...             # קריאות פנימיות (cron→python, python→next)

# Python Function (reconcile/import בלבד)
TELEGRAM_API_ID=... / TELEGRAM_API_HASH=... / SESSION_STRING=...
DATABASE_URL=...                    # או קריאה דרך ה-API הפנימי של נקסט
INTERNAL_API_SECRET=...
```

נעלמים לתמיד: `SESSION_STRING_MONITOR`, `ORIGIN_CORS` (אין יותר cross-origin),
כל קונפיגורציית Flask/Render.

## 8. מה נשאר בכוונה

- **מבנה ה-DB** — סכמת ה-Prisma הקיימת (10 מודלים) נשארת, בשינויים קטנים:
  `image_data` יוצא משימוש לטובת `image_url`, שדות sync מצטמצמים ל-`sync_status`
  של שיקוף יוצא בלבד.
- **ה-UI** — לא משתנה פונקציונלית; רק יעד ה-API מתחלף (Flask → relative `/api`)
  ורכיבי sync ידני מוסרים.
- **ה-AI routes** שכבר נכתבו בנקסט (suggest, reformat, refine, generate-image,
  menus/generate-preview) — נשארים כמו שהם.

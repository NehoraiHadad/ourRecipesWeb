# 🚀 מדריך הפעלה חד־פעמי

**תאריך**: 2026-08-25
**מסמכי אב**: [ARCHITECTURE.md](./ARCHITECTURE.md) (מה ולמה) · [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (איך נבנה)

המסמך הזה הוא רשימת הפעולות שמריצים **פעם אחת** כדי להעלות את המערכת לאוויר:
מ-DB ריק ועד ערוץ טלגרם שמזין את האפליקציה אוטומטית. כל צעד תלוי בקודמו — לרוץ לפי הסדר.

> **עיקרון מנחה** (ARCHITECTURE §2): ה-Postgres המנוהל הוא ה-source of truth היחיד.
> טלגרם הוא ממשק קלט ותצוגה. אין שרת ארוך־חיים בשום שלב.

**סימונים**: `$APP` = דומיין האפליקציה בוורסל (למשל `https://ourrecipes.vercel.app`),
`$TELEGRAM_BOT_TOKEN` / `$TELEGRAM_WEBHOOK_SECRET` / `$INTERNAL_API_SECRET` = הערכים
שהוגדרו ב-Vercel.

---

## 1. יצירת ה-DB המנוהל

ספק אחד מתוך Neon / Supabase / Vercel Postgres. שלושתם עונים על הדרישה היחידה:
Postgres שלא נמחק בריסטארט.

1. ליצור פרויקט/DB חדש ולהעתיק את מחרוזת ההתחברות **המאוגמת (pooled)**:

   ```
   postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
   ```

2. להגדיר אותה מקומית כדי לדחוף את הסכמה:

   ```bash
   cd frontend/ourRecipesFront
   npm install
   export DATABASE_URL="postgresql://..."
   npx prisma db push
   ```

   `db push` יוצר את כל 10 הטבלאות מ-`prisma/schema.prisma`. אין migrations להריץ —
   זו הקמה ראשונה.

3. אימות:

   ```bash
   npx prisma validate       # "The schema at prisma/schema.prisma is valid 🚀"
   npx prisma studio         # אופציונלי — לראות טבלאות ריקות
   ```

> ה-`prisma.config.ts` קורא את `DATABASE_URL` דרך `dotenv`, כך ש-`.env` מקומי עובד גם הוא.

---

## 2. פרויקט Vercel לאפליקציה

### 2.1 יצירת הפרויקט

- **Root Directory**: `frontend/ourRecipesFront`
- **Framework Preset**: Next.js (זיהוי אוטומטי)
- **Build Command**: `npm run build` (מריץ `prisma generate && next build`)

### 2.2 טבלת משתני הסביבה

להגדיר את כולם ב-Production (וכדאי גם ב-Preview). המקור המלא והמעודכן:
[`frontend/ourRecipesFront/.env.example`](../../frontend/ourRecipesFront/.env.example).

| משתנה | חובה | מקור / ערך | נקרא ב- |
|---|---|---|---|
| `DATABASE_URL` | ✅ | מחרוזת ההתחברות מצעד 1 | Prisma (כל ה-routes) |
| `JWT_SECRET` | ✅ | `openssl rand -base64 48` | `src/lib/auth/session.ts`, `src/middleware.ts` |
| `TELEGRAM_BOT_TOKEN` | ✅ | @BotFather (צעד 3) | webhook, שיקוף, `getChatMember`, אימות login |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | `openssl rand -hex 32` | `verifyTelegramWebhookSecret` (צעד 4) |
| `TELEGRAM_CHANNEL_ID` | ✅ | `-100…` של הערוץ הראשי | `src/lib/telegram/channels.ts` |
| `TELEGRAM_OLD_CHANNEL_ID` | ✅ | `-100…` של הערוץ הישן | אותו קובץ; נדרש לזרימת הניסוח מחדש |
| `GOOGLE_API_KEY` | ✅ | Google AI Studio | Gemini: suggest / reformat / refine / optimize-steps / תפריטים |
| `GOOGLE_API_KEY_NANO_BANANA` | ✅ | מפתח Gemini בפרויקט עם חיוב | `generate-infographic` (נופל חזרה ל-`GOOGLE_API_KEY`) |
| `HUGGINGFACE_TOKEN` | ✅ | huggingface.co → Access Tokens | `POST /api/recipes/generate-image` (SDXL) |
| `BLOB_READ_WRITE_TOKEN` | ✅ | נוצר אוטומטית בחיבור Blob Store (2.3) | `@vercel/blob` — תמונות מתכונים |
| `INTERNAL_API_SECRET` | ✅ | `openssl rand -hex 32` | `/api/internal/*` + הרצה ידנית של `/api/cron/*` |
| `NEXT_PUBLIC_TELEGRAM_BOT` | ✅ | שם המשתמש של הבוט, בלי `@` | Telegram Login Widget (צד לקוח) |
| `CRON_SECRET` | ✅ | `openssl rand -hex 32` | `requireCronSecret` — הקרון היומי (2.4) |
| `PYTHON_RECONCILE_URL` | ➖ | כתובת פונקציית api-python (צעד 5) | `/api/cron/reconcile`; ריק = דילוג על מעבר ההיסטוריה |
| `LOG_LEVEL` | ➖ | `info` (ברירת מחדל בפרודקשן) | `src/lib/logger.ts` |

`NODE_ENV` ו-`VERCEL_GIT_COMMIT_SHA` מסופקים על ידי Next/Vercel — **לא** להגדיר ידנית.
משתנים שנעלמו לתמיד: `NEXT_PUBLIC_API_URL`, `SECRET_JWT`, `ORIGIN_CORS`,
`SESSION_STRING_MONITOR` וכל קונפיגורציית Flask/Render.

### 2.3 Vercel Blob

בלשונית **Storage** של הפרויקט → **Create Blob Store** → לחבר לפרויקט.
Vercel מזריק את `BLOB_READ_WRITE_TOKEN` אוטומטית. בלעדיו תמונות מטלגרם פשוט לא יישמרו
(`storeTelegramPhoto` מחזיר `null` ולא מפיל את ה-webhook), אבל הטקסט כן.

### 2.4 Cron

`frontend/ourRecipesFront/vercel.json` כבר מגדיר:

```json
{ "crons": [ { "path": "/api/cron/reconcile", "schedule": "17 3 * * *" } ] }
```

Vercel שולח לקריאה הזו `Authorization: Bearer $CRON_SECRET` — לכן `CRON_SECRET`
חייב להיות מוגדר, אחרת כל הרצה תיפול על 401. הקרון עושה שני דברים בלתי תלויים:
משלים שיקופים שנכשלו (`sync_status='pending_telegram'`) וקורא ל-`PYTHON_RECONCILE_URL`
אם הוא מוגדר. אפשר לאמת ידנית:

```bash
curl -sS "$APP/api/cron/reconcile" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET"
```

(ה-route מקבל גם את `INTERNAL_API_SECRET` בכוונה, כדי לאפשר הרצה ידנית.)

### 2.5 פריסה ראשונה

Deploy מהענף הראשי. בדיקת עשן:

```bash
curl -sS "$APP/api/ping"
# {"data":{"status":"ok","database":"connected",...}}
```

---

## 3. יצירת הבוט וצירופו לשני הערוצים

1. ב-[@BotFather](https://t.me/BotFather): `/newbot` → לשמור את הטוקן ב-`TELEGRAM_BOT_TOKEN`
   ואת שם המשתמש ב-`NEXT_PUBLIC_TELEGRAM_BOT`.
2. `/setdomain` על הבוט → הדומיין של האפליקציה. בלי זה **Telegram Login Widget לא ייטען**.
3. **הערוץ הראשי** — להוסיף את הבוט כ-**אדמין** עם ההרשאות:
   - ✅ פרסום הודעות (Post Messages)
   - ✅ עריכת הודעות של אחרים (Edit Messages) — נדרש גם לשיקוף וגם לבדיקת ההרשאות של
     המשתמשים (`getChatMember`: `can_edit_messages`, ARCHITECTURE §4.5).
   - ✅ מחיקת הודעות (Delete Messages)
4. **הערוץ הישן** — להוסיף את הבוט כ-**אדמין** עם הרשאות קריאה בלבד (בלי פרסום/עריכה/מחיקה).
   בטלגרם, בוט חייב להיות אדמין בערוץ כדי לקבל `channel_post` בכלל; הזרימה מהערוץ הישן היא
   קריאה → ניסוח ב-Gemini → פרסום ב**ערוץ הראשי**, אז אין צורך בהרשאת כתיבה שם.
5. להוציא את מזהי הערוצים בפורמט `-100…` ולהזין ל-`TELEGRAM_CHANNEL_ID` ו-
   `TELEGRAM_OLD_CHANNEL_ID`. הדרך הפשוטה: להעביר הודעה מהערוץ אל [@userinfobot](https://t.me/userinfobot),
   או לקרוא את `chat.id` מ-`getUpdates` אחרי פוסט ניסיוני.

> `classifyChannel` מתעלם מכל `chat.id` שאינו אחד משני אלה — הודעה מערוץ זר לעולם לא נשמרת.

---

## 4. רישום ה-Webhook

הכתובת היא `POST /api/webhooks/telegram` באפליקציה.

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{
        \"url\": \"$APP/api/webhooks/telegram\",
        \"secret_token\": \"$TELEGRAM_WEBHOOK_SECRET\",
        \"allowed_updates\": [\"channel_post\", \"edited_channel_post\"],
        \"drop_pending_updates\": true
      }"
```

- `allowed_updates` **חייב** לכלול את `edited_channel_post` — בלעדיו עריכות בערוץ
  (וגם קונבנציית ה-🗑️ לארכוב, ARCHITECTURE §4.4) לא יגיעו לאפליקציה.
- `secret_token` נשלח חזרה בכל דליוורי בכותרת `X-Telegram-Bot-Api-Secret-Token`;
  ה-handler דוחה ב-401 כל בקשה שלא תואמת.
- `drop_pending_updates` מונע הצפה של הודעות שהצטברו לפני הרישום — ההיסטוריה נכנסת
  דרך צעד 5, לא דרך ה-webhook.

אימות:

```bash
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

מה לבדוק בתשובה:

| שדה | ערך תקין |
|---|---|
| `url` | `$APP/api/webhooks/telegram` |
| `has_custom_certificate` | `false` |
| `pending_update_count` | `0` |
| `allowed_updates` | `["channel_post","edited_channel_post"]` |
| `last_error_message` | לא קיים (אם קיים — כאן תראו למה) |

בדיקת קצה־לקצה: לפרסם מתכון בערוץ הראשי ולוודא שהוא מופיע בחיפוש באפליקציה תוך שניות.

---

## 5. יבוא ההיסטוריה (חד־פעמי) ואז reconcile

ה-Bot API לא רואה הודעות מלפני צירוף הבוט — לכן `api-python/` (FastAPI + Telethon).
אין לו גישה ל-DB: כל כתיבה עוברת ב-`/api/internal/*` של נקסט, כלומר דרך אותו קוד ingest
שה-webhook מריץ.

### 5.1 השגת `SESSION_STRING`

1. ב-[my.telegram.org](https://my.telegram.org) → *API development tools* → ליצור אפליקציה
   ולהעתיק `TELEGRAM_API_ID` + `TELEGRAM_API_HASH`.
2. לייצר StringSession לחשבון **משתמש** שחבר בערוץ (לא הבוט — בוט לא קורא היסטוריה):

   ```python
   from telethon.sync import TelegramClient
   from telethon.sessions import StringSession

   with TelegramClient(StringSession(), API_ID, API_HASH) as client:
       print(client.session.save())
   ```

   הפלט הוא ה-`SESSION_STRING`. זהו סוד מלא — לשמור כמו סיסמה.

### 5.2 הרצה מקומית (הדרך הפשוטה ליבוא חד־פעמי)

```bash
cd api-python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # ואז למלא
uvicorn main:app --reload --port 8000
```

`.env` דורש: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `SESSION_STRING`,
`TELEGRAM_CHANNEL_ID`, `NEXT_BASE_URL` (= `$APP`), `INTERNAL_API_SECRET`
(**אותו ערך** כמו באפליקציה). אופציונליים: `TELEGRAM_CHANNEL_URL`, `RECONCILE_LIMIT`,
`IMPORT_LIMIT`, `MAX_PHOTO_BYTES`, `HTTP_TIMEOUT_SECONDS`, `PORT`, `ENVIRONMENT`, `LOG_LEVEL`.

בדיקה:

```bash
curl -sS localhost:8000/health
# status: "healthy" → גם טלגרם מחובר וגם ה-API של נקסט נגיש
```

### 5.3 חלופה: פריסה כ-Vercel Python Function

`api-python/` הוא פרויקט Vercel עצמאי (`api/index.py` היא נקודת הכניסה, ה-`rewrites`
מנתבים כל נתיב ל-FastAPI):

```bash
cd api-python
vercel deploy --prod
```

להגדיר שם את אותם משתני סביבה, ואז להזין את הכתובת ל-`PYTHON_RECONCILE_URL`
באפליקציה (או ה-base URL או הנתיב המלא `…/reconcile` — הקרון מקבל את שניהם).

### 5.4 היבוא עצמו — עמוד אחרי עמוד

`POST /import-history` קורא מהחדש לישן. מזינים את `next_offset_id` של כל תשובה
כ-`offset_id` הבא, עד ש-`has_more` הוא `false`:

```bash
BASE=http://localhost:8000      # או כתובת הפריסה
OFFSET=0
while :; do
  RESPONSE=$(curl -sS -X POST "$BASE/import-history" \
    -H "Authorization: Bearer $INTERNAL_API_SECRET" \
    -H 'Content-Type: application/json' \
    -d "{\"offset_id\": $OFFSET, \"limit\": 100, \"with_photos\": true}")
  echo "$RESPONSE" | jq '{processed, upserted, failed, next_offset_id, has_more}'
  [ "$(echo "$RESPONSE" | jq -r .has_more)" = "true" ] || break
  OFFSET=$(echo "$RESPONSE" | jq -r .next_offset_id)
done
```

כל upsert אידמפוטנטי — עמוד שרץ פעמיים לא משנה דבר. תמונות מעל `MAX_PHOTO_BYTES`
(5MB כברירת מחדל) מדולגות, והטקסט עדיין נשמר.

### 5.5 reconcile אחרי היבוא

```bash
curl -sS -X POST "$BASE/reconcile" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"limit": 200}' | jq '{checked, upserted, unchanged, failed, mirror}'
```

`reconcile` משווה את ההודעות האחרונות מול ה-DB (לפי hash תוכן), משלים פערים,
ולבסוף מבקש מנקסט להשלים שיקופים שנכשלו.

### 5.6 אימות הספירות

דרך ה-endpoint הפנימי — כמה מתכונים נשמרו ומה מצבם:

```bash
# 20 המתכונים האחרונים לפי telegram_id
curl -sS "$APP/api/internal/recipes/summary?limit=20" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" | jq '{count, sample: .recipes[0]}'

# בדיקת הודעות ספציפיות
curl -sS "$APP/api/internal/recipes/summary?ids=1234,1235" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" | jq .
```

כל שורה מחזירה `telegram_id`, `content_hash`, `content_length`, `status`
(`ACTIVE`/`ARCHIVED`), `sync_status`, `has_image`, `updated_at`.
מזהה שחסר בתשובה = הודעה שלא נכנסה ל-DB. `count` מול מספר ההודעות בערוץ הוא
בדיקת השפיות המרכזית.

לסיום — בדיקה מהצד של המשתמש: כניסה לאפליקציה, חיפוש מתכון ישן, פתיחתו.

---

## 6. כיבוי Render (ה-backend הישן)

רק אחרי שצעדים 1–5 ירוקים והאפליקציה עובדת מקצה לקצה:

1. **לוודא שה-webhook כבר לא מצביע לשם** — `getWebhookInfo` (צעד 4) חייב להראות את
   הדומיין של Vercel. כל עוד יש שם כתובת ישנה, טלגרם ידבר עם שרת מת.
2. אם הותקנו webhooks/אינטגרציות נוספות מול Render (למשל בטלגרם או ב-GitHub) — להסירן.
3. ב-Render: Suspend לשירות, לוודא שאין תעבורה במשך יום, ואז **Delete Service**.
4. למחוק את משתני הסביבה השמורים ב-Render (הם מכילים סודות: טוקן הבוט, `SESSION_STRING`,
   מחרוזות DB ישנות).
5. **להחליף את הסודות שהיו חשופים שם** — במיוחד `TELEGRAM_BOT_TOKEN` ו-`SESSION_STRING`
   אם הם אותם ערכים. אחרי החלפת טוקן הבוט יש להריץ שוב את `setWebhook` מצעד 4.
6. הריפו כבר נקי: `backend/` (Flask), `telegram_service/` ו-`.github/workflows/deploy.yml`
   נמחקו בגל 2 — Vercel פורס ישירות מגיט, אין pipeline לתחזק.

---

## 7. נסיגה (Rollback)

**ה-DB הוא ה-source of truth, ולכן נסיגה כאן היא זולה:**

- **פריסה שנשברה** → Instant Rollback ב-Vercel לפריסה הקודמת. ה-DB לא נגע.
- **webhook בעייתי** → `deleteWebhook` מנתק את הקלט בזמן אמת בלי לאבד דבר; ההודעות
  שהצטברו בערוץ ייכנסו אחר כך דרך `/import-history` או `/reconcile`.

  ```bash
  curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
  ```

- **יבוא/reconcile חלקי או שנכשל באמצע** → פשוט להריץ שוב. שני המסלולים
  **אידמפוטנטיים**: ה-upsert מזוהה לפי `telegram_id = message_id`, ו-`reconcile` מדלג
  על כל הודעה שה-hash שלה זהה לזה שב-DB. אין כפילויות ואין נזק מהרצה כפולה.
- **מה שלא חוזר לבד**: מחיקת הודעה ידנית בערוץ (טלגרם לא שולח על כך webhook —
  ARCHITECTURE §4.4). הקונבנציה היא לערוך את ההודעה ולהוסיף 🗑️ בתחילתה, וה-handler
  יסמן `status=ARCHIVED`.
- **DB**: לא משחזרים אותו מטלגרם. גיבוי/PITR הוא באחריות ספק ה-Postgres — כדאי לוודא
  שהוא מופעל בפרויקט.

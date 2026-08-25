# ✅ תוכנית מימוש הדיפלוימנט — קובץ משימות

**תאריך יצירה**: 2026-08-25
**מסמכי אב**: [DEPLOYMENT.md](./DEPLOYMENT.md) (המדריך המפורט — כל צעד כאן מפנה לסעיף שם) · [ARCHITECTURE.md](./ARCHITECTURE.md)
**מצב נוכחי**: הקוד הושלם בענף `claude/app-status-architecture-18dyu7` (Waves 0–3 + סגירת חוב טכני). נותר: הדיפלוימנט עצמו.

**תשתית קיימת**:
- פרויקט Vercel: `our-recipes` (`prj_QNsMnUAS4gB6bXMXB8Wd5gOUk9AM`), מחובר לריפו, דומיין production: `https://the-our-recipes.vercel.app`
- פריסת production אחרונה: דצמבר 2025 (הארכיטקטורה הישנה)
- Backend ישן על Render — עדיין קיים, מכובה בשלב 7 בלבד

**סימון אחריות**: 🤖 = Claude יכול לבצע · 👤 = דורש אותך (סודות, חשבונות, אישורים)

> ⚠️ **Vercel Cost Guardrail**: פריסה אחת ל-production מ-main בלבד. אין Preview
> Deployments. כל צעד פריסה מסומן 👤 ומבוצע רק באישור מפורש.

---

## שלב 0 — שער איכות ומיזוג ל-main

- [ ] 🤖 0.1 על הענף: `npm install` → `npm run build` ירוק → `npx vitest run` ירוק (`frontend/ourRecipesFront/`)
- [ ] 🤖 0.2 פתיחת PR מ-`claude/app-status-architecture-18dyu7` ל-`main` עם סיכום השינויים
- [ ] 👤 0.3 סקירה ומיזוג ה-PR (המיזוג **עדיין לא** פורס כלום מסוכן — האפליקציה החדשה תעלה אבל בלי env vars היא לא פעילה; לחלופין: להשהות Auto-Deploy בפרויקט עד סוף שלב 2)

**החלטה נדרשת לפני מיזוג**: האם להשאיר Auto-Deploy מ-main פעיל (ואז הפריסה הראשונה תקרה במיזוג, לפני שה-env מוכן) או להגדיר env קודם (שלב 2) ורק אז למזג. **מומלץ: להשלים שלב 1–2 קודם, למזג אחר כך** — כך הפריסה הראשונה כבר תקינה.

---

## שלב 1 — DB מנוהל (DEPLOYMENT §1)

- [ ] 👤 1.1 בחירת ספק: **מומלץ Neon דרך Vercel Marketplace** (אינטגרציה מזריקה `DATABASE_URL` אוטומטית; חלופות: Supabase / Vercel Postgres)
- [ ] 👤 1.2 יצירת ה-DB והעתקת מחרוזת ההתחברות ה-**pooled** (`?sslmode=require`)
- [ ] 🤖 1.3 דחיפת הסכמה מקומית: `npx prisma db push` (יוצר את כל 10 הטבלאות; אין migrations — הקמה ראשונה)
- [ ] 🤖 1.4 אימות: `npx prisma validate` + בדיקה שהטבלאות קיימות
- [ ] 👤 1.5 לוודא שגיבוי/PITR מופעל אצל הספק (ה-DB הוא ה-source of truth — טלגרם לא משחזר אותו)

---

## שלב 2 — קונפיגורציית פרויקט Vercel (DEPLOYMENT §2)

- [ ] 🤖 2.1 אימות הגדרות הפרויקט הקיים `our-recipes`: Root Directory = `frontend/ourRecipesFront`, Framework = Next.js, Node 20+
- [ ] 👤 2.2 יצירת **Blob Store** בלשונית Storage וחיבורו לפרויקט (מזריק `BLOB_READ_WRITE_TOKEN` אוטומטית)
- [ ] 🤖 2.3 ייצור הסודות האקראיים: `JWT_SECRET` (base64 48), `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`, `CRON_SECRET` (hex 32 כ״א)
- [ ] 👤 2.4 הזנת כל משתני הסביבה ל-Production (הטבלה המלאה ב-DEPLOYMENT §2.2 / `.env.example`):
  - `DATABASE_URL` (משלב 1)
  - `JWT_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`, `CRON_SECRET` (מ-2.3)
  - `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_OLD_CHANNEL_ID` (משלב 3)
  - `GOOGLE_API_KEY`, `GOOGLE_API_KEY_NANO_BANANA`, `HUGGINGFACE_TOKEN` (קיימים — להעתיק מהקונפיגורציה הישנה)
  - `PYTHON_RECONCILE_URL` — להשאיר ריק בשלב זה (יוגדר בשלב 5 אם נפרוס את api-python)
- [ ] 👤 2.5 **מחיקת** משתני עבר מהפרויקט: `NEXT_PUBLIC_API_URL`, `SECRET_JWT`, `ORIGIN_CORS`, `SESSION_STRING_MONITOR` וכל שאריות Flask/Render
- [ ] 🤖 2.6 וידוא ש-`vercel.json` בענף כולל את ה-cron (`/api/cron/reconcile`, `17 3 * * *`) — כבר קיים ✓

---

## שלב 3 — בוט טלגרם ושני הערוצים (DEPLOYMENT §3)

- [ ] 👤 3.1 @BotFather: `/newbot` (או שימוש בבוט הקיים) → `TELEGRAM_BOT_TOKEN` + `NEXT_PUBLIC_TELEGRAM_BOT`
- [ ] 👤 3.2 @BotFather: `/setdomain` → `the-our-recipes.vercel.app` (בלעדיו Login Widget לא נטען)
- [ ] 👤 3.3 הוספת הבוט כאדמין ב**ערוץ הראשי** עם: Post + Edit + Delete Messages
- [ ] 👤 3.4 הוספת הבוט כאדמין ב**ערוץ הישן** (קריאה בלבד — בלי פרסום/עריכה/מחיקה)
- [ ] 👤 3.5 חילוץ מזהי `-100…` של שני הערוצים → `TELEGRAM_CHANNEL_ID`, `TELEGRAM_OLD_CHANNEL_ID`
- [ ] 👤 3.6 השלמת הזנת הערכים החסרים מ-2.4

---

## שלב 4 — פריסה ראשונה + רישום Webhook (DEPLOYMENT §2.5, §4)

- [ ] 👤 4.1 מיזוג ה-PR (שלב 0.3) → פריסת production אוטומטית מ-main (פריסה אחת, בהתאם ל-guardrail)
- [ ] 🤖 4.2 בדיקת עשן: `GET /api/ping` → `{"status":"ok","database":"connected"}`
- [ ] 🤖 4.3 רישום ה-webhook: `setWebhook` עם `url=$APP/api/webhooks/telegram`, `secret_token`, `allowed_updates=["channel_post","edited_channel_post"]`, `drop_pending_updates=true` (הפקודה המלאה ב-DEPLOYMENT §4)
- [ ] 🤖 4.4 אימות `getWebhookInfo`: url נכון, `pending_update_count=0`, אין `last_error_message`
- [ ] 👤 4.5 בדיקת קצה-לקצה: פרסום מתכון בערוץ הראשי → מופיע בחיפוש באפליקציה תוך שניות
- [ ] 👤 4.6 בדיקת login: כניסה עם Telegram Login Widget + וידוא הרשאות עריכה לאדמין

---

## שלב 5 — יבוא ההיסטוריה (חד-פעמי) + reconcile (DEPLOYMENT §5)

**החלטה**: הרצת `api-python` **מקומית** ליבוא החד-פעמי (מומלץ — פשוט יותר), ופריסה
ל-Vercel כפונקציה רק אם רוצים reconcile יומי מלא דרך `PYTHON_RECONCILE_URL`.

- [ ] 👤 5.1 my.telegram.org → `TELEGRAM_API_ID` + `TELEGRAM_API_HASH`
- [ ] 👤 5.2 ייצור `SESSION_STRING` לחשבון משתמש שחבר בערוץ (הסקריפט ב-DEPLOYMENT §5.1; סוד מלא!)
- [ ] 🤖 5.3 הקמת `api-python` מקומית: venv → `pip install -r requirements.txt` → `.env` → `uvicorn main:app --port 8000` → `GET /health` = healthy
- [ ] 🤖 5.4 יבוא עמוד-אחרי-עמוד: לולאת `POST /import-history` עם `offset_id` עד `has_more=false` (הסקריפט ב-§5.4; אידמפוטנטי — בטוח להריץ שוב)
- [ ] 🤖 5.5 `POST /reconcile` להשלמת פערים ושיקופים תלויים
- [ ] 🤖 5.6 אימות ספירות: `GET /api/internal/recipes/summary` מול מספר ההודעות בערוץ (בדיקת השפיות המרכזית)
- [ ] 👤 5.7 בדיקה מצד המשתמש: חיפוש מתכון ישן ופתיחתו באפליקציה
- [ ] 👤 5.8 (אופציונלי) פריסת `api-python` כפרויקט Vercel נפרד + הגדרת `PYTHON_RECONCILE_URL` באפליקציה — רק אם רוצים את מעבר ההיסטוריה בקרון היומי
- [ ] 🤖 5.9 אימות הקרון: הרצה ידנית של `/api/cron/reconcile` עם `INTERNAL_API_SECRET` → 200

---

## שלב 6 — כיבוי Render + רוטציית סודות (DEPLOYMENT §6)

**רק אחרי ששלבים 1–5 ירוקים והאפליקציה עובדת מקצה לקצה.**

- [ ] 🤖 6.1 וידוא `getWebhookInfo` מצביע ל-Vercel (לא ל-Render)
- [ ] 👤 6.2 הסרת webhooks/אינטגרציות ישנות מול Render (טלגרם / GitHub)
- [ ] 👤 6.3 Render: Suspend → המתנה של יום לוודא אפס תעבורה → **Delete Service**
- [ ] 👤 6.4 מחיקת משתני הסביבה ששמורים ב-Render (מכילים סודות)
- [ ] 👤 6.5 **רוטציית סודות שהיו חשופים ב-Render**: `TELEGRAM_BOT_TOKEN` (BotFather → `/revoke`) ו-`SESSION_STRING` אם שומרים אותו. אחרי החלפת טוקן → `setWebhook` מחדש (4.3) + עדכון env ב-Vercel
- [ ] 🤖 6.6 ניקוי הריפו המקומי: מחיקת `connect_to_our_recipes_channel.session` ו-`telegram_monitor.log` מה-root אם עדיין קיימים אחרי המיזוג

---

## שלב 7 — התייצבות ומעקב

- [ ] 🤖 7.1 יום-יומיים אחרי: בדיקת לוגים ב-Vercel (`get_runtime_errors`) — אין 5xx ב-webhook וב-cron
- [ ] 🤖 7.2 וידוא ריצת הקרון הלילי (03:17) הצליחה
- [ ] 👤 7.3 שימוש רגיל באפליקציה שבוע: יצירה/עריכה/תפריטים/תמונות
- [ ] 🤖 7.4 עדכון README ראשי לארכיטקטורה החדשה + ארכוב `Auth.md` הישן אם אינו רלוונטי

**נסיגה בכל שלב** (DEPLOYMENT §7): Instant Rollback ב-Vercel לפריסה קודמת ·
`deleteWebhook` לניתוק קלט · יבוא/reconcile אידמפוטנטיים — מריצים שוב.

---

## סיכום החלטות פתוחות (לפני שמתחילים)

| # | החלטה | המלצה |
|---|---|---|
| 1 | ספק Postgres | Neon דרך Vercel Marketplace |
| 2 | סדר: env קודם או מיזוג קודם | env (שלבים 1–3) ואז מיזוג — הפריסה הראשונה כבר תקינה |
| 3 | בוט חדש או קיים | אם הטוקן הקיים חי ב-Render — עדיף בוט קיים עכשיו ורוטציה בשלב 6.5 |
| 4 | api-python: מקומי או Vercel | מקומי ליבוא; פריסה רק אם רוצים reconcile היסטוריה יומי |

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

- [x] 🤖 0.1 על הענף: build ירוק + 351/351 בדיקות עוברות (2026-08-25)
- [x] 🤖 0.2 PR נפתח: [#127](https://github.com/NehoraiHadad/ourRecipesWeb/pull/127)
- [x] 👤 0.3 PR #127 מוזג ל-main (2026-08-25) (המיזוג **עדיין לא** פורס כלום מסוכן — האפליקציה החדשה תעלה אבל בלי env vars היא לא פעילה; לחלופין: להשהות Auto-Deploy בפרויקט עד סוף שלב 2)

**החלטה נדרשת לפני מיזוג**: האם להשאיר Auto-Deploy מ-main פעיל (ואז הפריסה הראשונה תקרה במיזוג, לפני שה-env מוכן) או להגדיר env קודם (שלב 2) ורק אז למזג. **מומלץ: להשלים שלב 1–2 קודם, למזג אחר כך** — כך הפריסה הראשונה כבר תקינה.

---

## שלב 1 — DB מנוהל (DEPLOYMENT §1)

- [x] 👤 1.1 נבחר: Neon דרך Vercel Marketplace
- [x] 🤖 1.2 `vercel integration add neon` — DB בשם `neondb` (us-east-1), `DATABASE_URL` pooled הוזרק אוטומטית
- [x] 🤖 1.3 `npx prisma db push` — הסכמה נדחפה בהצלחה
- [x] 🤖 1.4 `npx prisma validate` ✓
- [ ] 👤 1.5 לוודא שגיבוי/PITR מופעל אצל הספק (ה-DB הוא ה-source of truth — טלגרם לא משחזר אותו)

---

## שלב 2 — קונפיגורציית פרויקט Vercel (DEPLOYMENT §2)

- [x] 🤖 2.1 אומת: Root Directory = `frontend/ourRecipesFront`, Next.js, Node 20.x
- [x] 🤖 2.2 Blob Store `our-recipes-images` (public, iad1) נוצר וחובר — `BLOB_READ_WRITE_TOKEN` הוזרק
- [x] 🤖 2.3 ארבעת הסודות יוצרו ונשמרו גם ב-`.env.local` המקומי
- [x] 🤖 2.4 הוזנו ל-Production: `JWT_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN` (הבוט הקיים `ourRecipes_bot`), `GOOGLE_API_KEY`, `HUGGINGFACE_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT=ourRecipes_bot`
  - [x] 🤖 `TELEGRAM_CHANNEL_ID=-1002227819547` ("המתכונים שלנו - WEB"), `TELEGRAM_OLD_CHANNEL_ID=-1001333985620` ("המתכונים שלנו") — זוהו בוודאות דרך Telethon
  - [x] 🤖 `GOOGLE_API_KEY_NANO_BANANA` הוזן (המפתח סופק מתוך env של Render)
- [x] 🤖 2.5 הוסר `NEXT_PUBLIC_API_URL`; שאר משתני העבר לא היו קיימים בפרויקט
- [x] 🤖 2.6 cron ב-`vercel.json` ✓

---

## שלב 3 — בוט טלגרם ושני הערוצים (DEPLOYMENT §3)

- [x] 👤 3.1 נבחר הבוט הקיים: `ourRecipes_bot` ("המתכונים שלנו") — הטוקן אומת מול `getMe`, אין webhook ישן רשום עליו
- [x] 👤 3.2 @BotFather: `/setdomain` → `recipes.nehoraihadad.com` (דווח כבוצע; ייבדק בפועל בכניסה ראשונה עם ה-Widget)
- [x] 👤 3.2.1 דומיין קנוני `recipes.nehoraihadad.com` — CNAME הוגדר ב-Cloudflare, הדומיין חי ומגיש את האפליקציה
- [x] 👤 3.3 הבוט נוסף לערוץ הראשי (אומת: `getChatMember` עובד, לוגין עם `canEdit=true` הצליח)
- [x] 👤 3.4 הבוט אדמין בערוץ הישן (בפועל עם הרשאות מלאות — מספיק; אפשר לצמצם לקריאה בלבד, לא חובה)
- [x] 🤖 3.5 המזהים חולצו ואומתו (ראה 2.4)
- [x] 🤖 3.6 כל משתני הסביבה הוזנו

---

## שלב 4 — פריסה ראשונה + רישום Webhook (DEPLOYMENT §2.5, §4)

- [x] 👤 4.1 מוזג ונפרס — production חי על `recipes.nehoraihadad.com` (וגם `the-our-recipes.vercel.app`)
- [x] 🤖 4.2 `GET /api/ping` → `{"status":"ok","database":"connected"}` ✓
- [x] 🤖 4.3 webhook נרשם ל-`https://recipes.nehoraihadad.com/api/webhooks/telegram`
- [x] 🤖 4.4 `getWebhookInfo` ✓ — url נכון, pending=0, אין שגיאות
- [x] 🤖 4.5 קצה-לקצה אומת: פוסט בערוץ (דרך Telethon) → נקלט ב-DB תוך שניות (ACTIVE) → עריכה עם 🗑️ → ARCHIVED → הודעת הבדיקה נמחקה. הערה: הודעות שהבוט עצמו שולח לא מייצרות webhook (מגבלת טלגרם) — לכן שיקוף מהאפליקציה לא יוצר לולאה
- [x] 👤 4.6 לוגין טלגרם אומת בלוגים: `userId=141413702`, `status=creator`, `canEdit=true`
- [x] 🤖 4.7 באג שנמצא ותוקן אחרי הפריסה: הסאג'שנים בחיפוש שלחו `?q=` בעוד ה-route קורא `query` → תמיד ריקים. תוקן ב-`searchService.ts` (קומיט `2df333c`)
- [x] 🤖 4.8 **ביקורת חוזים UI↔API מקיפה** (שני תת-סוכנים סרקו את כל נקודות הקצה מול כל הקריאות בצד הלקוח) — כל הממצאים תוקנו במרוכז:
  - **קריטי**: פרויקציית החיפוש השמיטה את `raw_content` → מודל מתכון ריק מהעמוד הראשי + סכנת דריסת תוכן בעריכה ידנית. תוקן: שורות מלאות ב-`search/route.ts`
  - `generate-image` החזיר base64 גולמי בעוד מסלולי השמירה דורשים `data:image` URI → תמונות AI נזרקו בשקט. תוקן: קידומת בשרת (כמו Flask)
  - פרויקציית `recipes/manage` הוחזרה לזהות Flask (מרכיבים/הוראות/קושי/זמן הכנה בתצוגות המקדימות)
  - חיפוש ורשימת תפריטים היו קטומים ל-20 בשקט → השירותים שואבים את כל העמודים
  - `GET /api/menus/:id` + `/menus/shared/:token` החזירו enum גולמי (MEAT/EASY) במקום ערכי Flask קטנים → עברו ל-`serializeMenu`
  - `generate-preview` maxDuration הועלה מ-60 ל-120 שניות (הלקוח מחכה 120)
  - `telegram_id` שלילי (placeholder כשטלגרם נופל) נדחה ע"י הוולידציה → `validateTelegramId` חדש
  - עריכה ידנית שלחה את התמונה הישנה במקום החדשה → תוקן ב-`RecipeDetails`
  - קוסמטי: טיפוס `ValidateResponse` שטוח ל-auth, interceptors חוברו ב-`apiService`, `last_sync_at`→`last_sync`, הוסר `status` פיקטיבי מ-`ApiResponse`
  - הערה: `created_by` לא קיים בסכמה החדשה — תג "נוצר ע"י" במסך הניהול נשאר מוסתר (פער סכמה, לא פער חוזה)

---

## שלב 5 — יבוא ההיסטוריה (חד-פעמי) + reconcile (DEPLOYMENT §5)

**החלטה**: הרצת `api-python` **מקומית** ליבוא החד-פעמי (מומלץ — פשוט יותר), ופריסה
ל-Vercel כפונקציה רק אם רוצים reconcile יומי מלא דרך `PYTHON_RECONCILE_URL`.

- [x] 👤 5.1 קיימים מקומית: `TELEGRAM_API_ID=25198922` + `TELEGRAM_API_HASH` (מ-`backend/.env` הישן)
- [x] 👤 5.2 SESSION_STRING חדש יוצר והוזן ב-`api-python/.env`
- [x] 🤖 5.3 uvicorn מקומי → `/health` = healthy (טלגרם מחובר + Next נגיש)
- [x] 🤖 5.4 היבוא הושלם: 3 עמודים, **210 הודעות עובדו / 210 upserted / 0 כשלונות** (מתוך 218 בערוץ — היתר הודעות שירות)
- [x] 🤖 5.5 reconcile: 210 checked / 210 unchanged / 0 failed
- [x] 🤖 5.6 אימות ספירות: 210 מתכונים ב-DB, כולם ACTIVE, 91 עם תמונה
- [ ] 👤 5.7 בדיקה מצד המשתמש: חיפוש מתכון ישן ופתיחתו באפליקציה (🤖 אומת ב-API: כניסת אורח → חיפוש "עוגה" → 8 תוצאות)
- [x] 👤 5.8 הוחלט: לא פורסים את api-python; הקרון מדלג על מעבר ההיסטוריה (`reason: not_configured`)
- [x] 🤖 5.9 `/api/cron/reconcile` הורץ ידנית → `{"ok":true}` ✓

---

## שלב 6 — כיבוי Render + רוטציית סודות (DEPLOYMENT §6)

**רק אחרי ששלבים 1–5 ירוקים והאפליקציה עובדת מקצה לקצה.**

- [ ] 🤖 6.1 וידוא `getWebhookInfo` מצביע ל-Vercel (לא ל-Render)
- [ ] 👤 6.2 הסרת webhooks/אינטגרציות ישנות מול Render (טלגרם / GitHub)
- [ ] 👤 6.3 Render: Suspend → המתנה של יום לוודא אפס תעבורה → **Delete Service**
- [ ] 👤 6.4 מחיקת משתני הסביבה ששמורים ב-Render (מכילים סודות)
- [ ] 👤 6.5 **רוטציית סודות שהיו חשופים ב-Render**: `TELEGRAM_BOT_TOKEN` (BotFather → `/revoke`) ו-`SESSION_STRING` אם שומרים אותו. אחרי החלפת טוקן → `setWebhook` מחדש (4.3) + עדכון env ב-Vercel
- [x] 🤖 6.6 נוקו הקבצים המקומיים `connect_to_our_recipes_channel.session` (session פג) ו-`telegram_monitor.log`

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

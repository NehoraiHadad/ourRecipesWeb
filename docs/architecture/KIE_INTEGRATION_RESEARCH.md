# מחקר שילוב Kie.ai במערכת ourRecipes

> מסמך מחקר בלבד — ללא מימוש. נכתב 2026-08-25 על בסיס docs.kie.ai ומקורות ציבוריים.
> מחירים מסומנים כמשוערים וצריכים אימות מול https://kie.ai/pricing לפני החלטה.

## 1. מה זה Kie.ai

Kie.ai הוא אגרגטור API למודלים גנרטיביים: מפתח API אחד + מטבע קרדיטים אחיד, עם מחירים
נמוכים ב-30%–80% מה-API הרשמי של הספקים. הקטלוג הרלוונטי לנו:

| קטגוריה | מודלים בולטים |
|---|---|
| תמונה | Nano Banana / Pro / 2 (Gemini Image), GPT Image 1.5/2, Flux‑2, Seedream 4/5, Imagen 4, Qwen, Ideogram |
| וידאו | Veo 3.1 (fast/quality/lite), Kling 2.6/3.0, Seedance 2.x, Wan 2.x, Hailuo, Runway, PixVerse |
| אודיו/מוזיקה | Suno (מוזיקה מלאה), ElevenLabs TTS, Gemini TTS |
| שיפור תמונה | Topaz Upscale, Recraft Remove Background / Crisp Upscale |
| LLM | GPT/Claude/Gemini/Grok (פחות רלוונטי — יש לנו Gemini ישיר) |

## 2. מבנה ה-API

### אימות ומגבלות (מתוך ה-Getting Started הרשמי)
- `Authorization: Bearer KIE_API_KEY` + `Content-Type: application/json`
  (מפתח מ-kie.ai/api-key; חסר/שגוי → `{"code":401,"msg":"You do not have access permissions"}`).
- אסור לחשוף את המפתח בצד לקוח; תמיכה ב-IP whitelist ו-rate limits פר מפתח.
- **Rate limits:** עד 20 בקשות יצירה לכל 10 שניות, ~100+ משימות במקביל פר חשבון; חריגה → 429 בלי כניסה לתור. (לא מגבלה מעשית לשימוש משפחתי, רלוונטי רק ל-batch upscale.)
- **לוגים:** kie.ai/logs — מקור האמת לבירורי חיוב (מודל, פרמטרים, סטטוס, קרדיטים לכל task); נשמרים חודשיים.
- לכל מודל יש עמוד Playground ב-kie.ai/market לניסוי ידני לפני חיבור API.

### מודל אסינכרוני אחיד (Jobs API — "Market")
כל יצירה היא task אסינכרוני:

```
POST https://api.kie.ai/api/v1/jobs/createTask
{ "model": "nano-banana-2", "input": { "prompt": "...", ... }, "callBackUrl": "..." }
→ { "code": 200, "data": { "taskId": "..." } }

GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
→ data: { state, resultJson: "{\"resultUrls\":[...]}", failMsg, progress, creditsConsumed, ... }
```

- מצבי task: `waiting → queuing → generating → success | fail`.
- המלצת פולינג רשמית: להתחיל ב-2–3 שניות עם backoff; לפרודקשן מומלץ callback.
- למודלים ותיקים (Veo, Suno, Runway, 4o‑image) יש endpoints ייעודיים במבנה דומה
  (למשל `POST /api/v1/veo/generate`), אך ה-Jobs API מכסה את רוב הקטלוג באופן אחיד.

### Callbacks (webhooks)
- שולחים `callBackUrl` ביצירת ה-task; בסיום מגיע POST עם ה-taskId והתוצאה.
- אבטחה: כותרות `X-Webhook-Timestamp` + `X-Webhook-Signature`,
  חתימה `base64(HMAC-SHA256(taskId + "." + timestamp, webhookHmacKey))` — המפתח מוגדר בהגדרות החשבון.
- מדיניות retry לא מתועדת → אסור להסתמך על callback בלבד; נדרש fallback של פולינג.

### עזרים
- `GET /api/v1/chat/credit` — יתרת קרדיטים (טוב לניטור).
- File Upload API — העלאת קבצי קלט (base64 / stream / URL). בפועל לרוב לא נצטרך:
  תמונות המתכונים שלנו כבר יושבות ב-Vercel Blob עם URL ציבורי, ו-`image_input` מקבל URLs.
- **Retention קריטי:** קבצי מדיה שנוצרו נשמרים אצל Kie **14 יום בלבד** ואז נמחקים,
  וקישורי הורדה זמניים (`/common-api/download-url`) פגים אחרי 20 דקות —
  חובה להעתיק כל תוצר ל-Vercel Blob שלנו מיד עם הקבלה (ראו §5.4).

### תמחור
- קרדיט ≈ $0.005 (חבילת 1,000 קרדיטים = $5). מחירים משוערים (לאימות):

| מודל | עלות משוערת |
|---|---|
| Nano Banana (תמונה) | ~$0.02 לתמונה |
| Nano Banana 2 | ~8 קרדיטים ≈ $0.04 (לפי דוגמת callback בדוקומנטציה) |
| Nano Banana Pro (Gemini 3 Pro Image) | ~$0.09–0.12 לתמונה (מול ~$0.15 רשמי) |
| Veo 3.1 fast (וידאו 8ש׳) | ~$0.30 לקליפ ("25% מהמחיר הרשמי של Google") |
| Veo 3.1 quality | ~$2.00 לקליפ |
| Suno (שיר) | סדר גודל של אגורות בודדות–עשרות לשיר |

## 3. מצב קיים במערכת (נקודת ההשוואה)

| מסלול | מימוש היום | הערות |
|---|---|---|
| `POST /api/recipes/generate-image` | HuggingFace Inference API, SDXL base 1.0, סינכרוני, מחזיר data‑URI | איכות בינונית-נמוכה, prompt מחולץ משם המתכון בלבד; ה-HF Inference API הישן בדעיכה |
| `POST /api/recipes/generate-infographic` | Gemini 3 Pro Image ("Nano Banana Pro") ישירות מול Google, מפתח בתשלום נפרד (`GOOGLE_API_KEY_NANO_BANANA`) | עובד סינכרוני; טקסט עברית באינפוגרפיקה |
| reformat / suggest / refine / optimize-steps | Gemini 2.0 Flash טקסטואלי | אין סיבה להעביר ל-Kie |
| שמירת תמונות | ה-UI מקבל data‑URI ושומר דרך `decodeBase64Image` → Vercel Blob (`lib/recipes/image.ts`, `lib/images/blob.ts`) | ה-DB שומר URL בלבד |

## 4. מיפוי נקודות שילוב

| פיצ'ר | מודל Kie מוצע | עלות משוערת | ערך | מאמץ |
|---|---|---|---|---|
| **שדרוג תמונת מתכון** (מחליף SDXL) | `nano-banana` או `nano-banana-2` | $0.02–0.04 | קפיצת איכות גדולה; זמן יצירה ~10–30ש׳; אפשר גם עריכת תמונה קיימת (image→image) | נמוך |
| **אינפוגרפיקה** (מחליף Google ישיר) | `nano-banana-pro` — אותו מודל בדיוק | ~$0.09–0.12 מול ~$0.15 | חיסכון ~30–40% + ביטול מפתח Google נפרד; המחיר: מעבר מסינכרוני לאסינכרוני | נמוך-בינוני |
| **וידאו קצר למתכון** (חדש) | Veo 3.1 fast image→video מתמונת המתכון שכבר ב-Blob; חלופות זולות: Wan / Seedance mini | ~$0.30 ל-8ש׳ | "המנה מתעוררת לחיים" בדף המתכון / שיתוף בטלגרם; wow משפחתי | בינוני-גבוה (דורש jobs אסינכרוניים) |
| **שיפור תמונות ישנות מהערוץ** (חדש) | Topaz / Recraft Crisp Upscale | אגורות לתמונה | תמונות טלגרם ישנות ומטושטשות → חדות; ריצת batch חד-פעמית | נמוך |
| **הקראת מתכון (TTS)** (חדש) | ElevenLabs / Gemini TTS | זניח | מצב "בישול ללא ידיים" יחד עם שלבים מובנים (`ingredients_list`/steps) | בינוני |
| **שיר מתכון / ברכה** (חדש, גימיק) | Suno | אגורות | כיף משפחתי (שיר יום הולדת עם המתכון) — nice to have | נמוך |

הערת איכות עברית: Nano Banana Pro הוא כיום המוביל ברינדור טקסט רב-לשוני בתוך תמונה —
בדיוק המודל שכבר נבחר לאינפוגרפיקות. ב-Kie זה אותו מודל, רק זול יותר ודרך task אסינכרוני.

## 5. ארכיטקטורת שילוב מוצעת

### 5.1 מיקום הקוד

```
src/lib/ai/
  kie/
    client.ts     # fetch דק: createTask / recordInfo / getCredits, טיפול ב-code!=200
    poll.ts       # pollUntilDone(taskId, {timeoutMs, backoff}) — לשימוש בזרימות "כמעט-סינכרוניות"
    models.ts     # קבועי מזהי מודלים + טיפוסי input פר-מודל
    types.ts      # KieTaskState, KieTaskRecord, resultJson parsing
  aiService.ts    # (העברה עתידית של lib/services/aiService.ts לכאן — אופציונלי)
```

עקרון: `client.ts` לא יודע כלום על מתכונים; הלוגיקה העסקית (prompt, שמירה ל-Blob)
נשארת ב-route/service — עקבי עם המבנה הקיים וכלל ה-150 שורות לקובץ.

### 5.2 משתני סביבה

| משתנה | תפקיד |
|---|---|
| `KIE_API_KEY` | מפתח API (Bearer) |
| `KIE_WEBHOOK_HMAC_KEY` | אימות חתימת callbacks (רק אם בוחרים במסלול callbacks) |

### 5.3 טיפול באסינכרוניות על Vercel — שתי רמות

**רמה א' — תמונות (10–40 שניות): פולינג בתוך הבקשה.**
ה-route (generate-image / generate-infographic) יוצר task ועושה פולינג פנימי עד success,
מוריד את התמונה ומחזיר data‑URI — **החוזה מול ה-UI הקיים לא משתנה בכלל**
(`MealSuggestionForm`, `RecipeEditForm`, `RecipeDetails` ממשיכים לעבוד כמו היום).
נדרש `export const maxDuration = 120` (או 300) ב-route — נתמך ב-Fluid Compute גם ב-Hobby.
זה המסלול הפשוט והמומלץ לשלב ראשון.

**רמה ב' — וידאו (1–6 דקות): זרימה אסינכרונית אמיתית.** שתי חלופות:

1. **Callback (מומלץ):** route חדש `POST /api/ai/kie/callback` שמאמת HMAC,
   שולף את התוצאה, מעתיק ל-Vercel Blob ומעדכן רשומה. דורש טבלת מעקב קטנה ב-Prisma
   (למשל `MediaJob`: taskId, recipeId, kind, state, resultUrl, error, timestamps).
   ה-UI עושה פולינג קליל מול ה-DB שלנו (`GET /api/recipes/:id/media-jobs`) או פשוט
   מציג "בהכנה…" עד שהשדה מתמלא. יש לנו כבר תבנית webhook עובד (טלגרם) — דפוס מוכר.
2. **פולינג מצד הלקוח בלבד (בלי DB):** ה-route יוצר task ומחזיר taskId; ה-UI מפעיל
   `GET /api/ai/kie/status?taskId=...` כל כמה שניות. פשוט יותר (בלי מיגרציה),
   אבל התוצאה אובדת אם המשתמש סוגר את הדף לפני ההשלמה.

בגלל ש-retry של callbacks לא מתועד — גם במסלול 1 כדאי fallback: cron קיים/חדש של Vercel
שסורק jobs תקועים (state ישן מ-15 דקות) ובודק אותם מול `recordInfo`.

### 5.4 אחסון תוצרים
כל תוצר (תמונה/וידאו) מועתק מיידית ל-Vercel Blob (כמו `storeTelegramPhoto`) —
קבצי Kie נמחקים אחרי 14 יום, וקישורי ההורדה הזמניים פגים אחרי 20 דקות.
ה-DB ממשיך לשמור URL בלבד, בהתאם ל-ARCHITECTURE §5. שלב ההורדה-ל-Blob הוא
חלק מה-pipeline, לא אופציה.

### 5.5 יציבות ו-fallback
Kie הוא סטארטאפ קטן ומתווך לא-רשמי; היציבות צפויה להיות מעט נמוכה מהספקים הרשמיים —
trade-off מודע מול המחיר (תמיכה: Discord/Telegram מהדשבורד, UTC 21:00–17:00).
לכן מומלץ לתכנן degrade חינני:
- **אינפוגרפיקה:** להשאיר את מסלול Google הישיר (`GOOGLE_API_KEY_NANO_BANANA`) כ-fallback
  אוטומטי כש-Kie נכשל — אותו מודל בדיוק, רק יקר יותר.
- **תמונת מתכון:** כישלון Kie מחזיר שגיאה רגילה ל-UI (כמו היום עם HF) — פיצ'ר קוסמטי, לא קריטי.
- **וידאו:** פיצ'ר חדש ותלוי-Kie בלבד; אם Kie למטה — הכפתור פשוט נכשל. מקובל.

### 5.6 אומדן עלות חודשי (שימוש משפחתי)
הנחת עבודה: ~30 תמונות + ~10 אינפוגרפיקות + ~10 סרטוני Veo fast בחודש:
`30×$0.03 + 10×$0.11 + 10×$0.30 ≈ $5` — חבילת הקרדיטים המינימלית ($5) מספיקה בערך לחודש
כולל וידאו; בלי וידאו — סנטים בודדים בחודש.

## 6. סדר מימוש מוצע (כשיוחלט לממש)

1. `lib/ai/kie/` (client + poll + types) + `KIE_API_KEY` — ללא שינוי UI.
2. החלפת SDXL ב-`nano-banana` ב-generate-image (רמה א', אותו חוזה תגובה). הרווח הכי גדול, הסיכון הכי קטן.
3. העברת generate-infographic ל-`nano-banana-pro` דרך Kie (חיסכון + איחוד billing).
4. וידאו למתכון — רק אחרי הכרעה על מסלול callbacks + מיגרציית `MediaJob`.
5. אופציונלי: batch upscale לתמונות ישנות; TTS; Suno.

## 7. שאלות פתוחות להכרעת נהוראי

1. **היקף:** רק שדרוג תמונות (שלבים 1–3), או גם וידאו? הווידאו הוא עיקר המוטיבציה ל-Kie —
   בלי וידאו אפשר לשקול גם פשוט לעבור ל-Nano Banana דרך ה-API של Google שכבר מחובר.
2. **תלות בספק:** Kie הוא מתווך לא-רשמי (reseller) עם יציבות צפויה נמוכה מעט מהרשמי (§5.5).
   מקובל עלינו לתלות בו פיצ'רים קבועים, או שמגבילים אותו לפיצ'רים "קוסמטיים" שקל לכבות,
   עם Gemini ישיר כ-fallback לאינפוגרפיקה?
3. **מסלול הווידאו:** callbacks + טבלת `MediaJob` (יציב, דורש מיגרציה) מול פולינג מצד הלקוח
   (זול, אובד בסגירת דף)?
4. **מודל וידאו:** Veo 3.1 fast (~$0.30, איכות גבוהה) מול Wan/Seedance (~$0.05–0.15, איכות סבירה)?
   שווה בדיקת side-by-side על 2–3 מתכונים לפני בחירה.
5. **תקציב:** לטעון $5 ולבדוק? יש דיווחים בקהילה על קרדיטים חינם להתנסות — לאמת בהרשמה.
6. **אינפוגרפיקה:** להעביר ל-Kie (חיסכון ~30–40%) או להשאיר על Google ישיר (סינכרוני, עובד היום)?

## 8. מקורות

- **Getting Started with KIE API הרשמי** (הועבר ע"י נהוראי) — מקור מוסמך לאימות, rate limits, retention (14 יום למדיה, חודשיים ללוגים), המודל האסינכרוני והיציבות
- Docs: https://docs.kie.ai (סקירת ה-sitemap המלא בוצעה דרך docs.kie.ai/llms.txt)
- Jobs API: docs.kie.ai/market/quickstart, market/common/get-task-detail
- מודלים: market/google/nanobanana2, market/google/pro-image-to-image, veo3-api/generate-veo-3-video
- אבטחת webhooks: common-api/webhook-verification; תוקף קישורים: common-api/download-url
- תמחור (משוער, לאימות): kie.ai/pricing, וכן סקירות ציבוריות (bitdoze.com/kie-ai-review ועוד)

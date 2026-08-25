# מחקר בחירת מודלי AI — ourRecipes

> מסמך מחקר בלבד (2026-08-25). ללא שינויי קוד. משלים את `KIE_INTEGRATION_RESEARCH.md`.
> מחירים נכונים לאוגוסט 2026 ומשתנים תדיר — לאמת מול עמודי התמחור לפני חיוב.

## 0. ממצא דחוף לפני הכול

הקוד קורא היום ל-`gemini-2.0-flash-exp` בחמישה מקומות
(`aiService.ts` ×4, `menuPlannerService.ts` ×1). **משפחת Gemini 2.0 כובתה ב-1 ביוני 2026** —
קריאות ל-`gemini-2.0-flash*` מחזירות שגיאה. כלומר reformat / suggest / refine / optimize-steps /
menu-planner ככל הנראה **שבורים בפרודקשן כרגע**, ולא רק "ישנים". זו הסיבה הכי דחופה לשדרוג.
(`gemini-2.5-*` מכובה בתורו ב-16 באוקטובר 2026 — אין טעם לעבור אליו.)

---

# Q1 — מודל יצירת תמונות

## 1.1 טבלת השוואה

| מודל | מזהה ב-Kie | מחיר Kie / תמונה | מחיר רשמי | פוטוריאליזם אוכל | טקסט עברי בתמונה | קלט |
|---|---|---|---|---|---|---|
| **Nano Banana Pro** (Gemini 3 Pro Image) | `nano-banana-pro` | ~$0.12 (1K/2K), ~$0.20 (4K) | $0.134 / $0.24 | **מצוין** — "physics-accurate materials", מוביל בצילום מוצר | **✅ 2/2 בבדיקה עברית** | T2I + עד 8 תמונות ייחוס |
| **Nano Banana 2** (Gemini 3.1 Flash Image) | `nano-banana-2` | ~$0.04 (1K), ~$0.06 (2K), ~$0.09 (4K) | $0.067 / $0.101 / $0.151 | טוב מאוד, מהיר מאוד (~שניות) | טוב לרב-לשוני, **עברית לא נבדקה** | T2I + עד 14 תמונות (`image_input`) |
| **Nano Banana 2 Lite** | `nano-banana-2-lite` | ~$0.02 | — | סביר | לא מומלץ לטקסט | T2I + edit |
| **GPT Image 2** (OpenAI) | `gpt-image-2-text-to-image` / `gpt-image-2-image-to-image` | **$0.03 (1K) / $0.05 (2K) / $0.08 (4K)** | ~$0.165 high (טוקנים) | "הכי טוב כללי", אך לוק "AI-clean" מלוטש | **הכי טוב בטיפוגרפיה (98.5%)** — 99%+ ב-Latin/CJK/ערבית; **עברית לא מתועדת** | T2I + image-edit |
| Seedream 5 Pro | `seedream-5-pro-*` | ~$0.035–0.06 | ~$0.045 | קולנועי/פרסומי | 89.5% טיפוגרפיה — החלש בשלישייה | T2I + edit |
| FLUX 2 Pro | `flux-2-pro-*` | ~$0.015 | $0.015 | טוב, זול מאוד | **❌ נכשל בעברית** | T2I + edit |
| Imagen 4 / Ideogram V2 / SD 3.5 | קיימים | זול | — | בינוני | **❌ נכשלו בעברית** | — |
| SDXL (הקיים היום ב-HF) | — | חינם/HF | — | **חלש** | ❌ | T2I |

מקור עברית: בדיקה בלתי-תלויה מ-25.3.2026 שבחנה 12 מודלים על שתי מילים (שלום, פירגון) —
**רק Gemini 3 Pro ו-Nano Banana Pro קיבלו 2/2**; Wan 2.5 קיבל 1/2; כל השאר נכשלו (כולל
רינדור ערבית/רוסית במקום עברית, ואותיות עבריות בסדר חסר-משמעות). GPT Image לא נכלל בבדיקה.

## 1.2 המלצות Q1

| תפקיד | מודל נבחר | נימוק |
|---|---|---|
| **תמונת מתכון (ראשי)** | `nano-banana-2` דרך Kie, 2K | ~$0.06 לתמונה, מהיר (שניות ולא דקות → פולינג קצר ב-route), איכות אוכל גבוהה, ותומך `image_input` — כלומר גם *שדרוג* תמונות טלגרם ישנות ולא רק יצירה מאפס. אותה משפחת מודלים כמו האינפוגרפיקה = prompt-style אחיד. |
| **תמונת מתכון (שדרוג "hero")** | `nano-banana-pro` | לתמונת שער של מתכון אהוב; ~$0.12. אופציונלי. |
| **אינפוגרפיקה עברית (ראשי)** | `nano-banana-pro` דרך Kie | **המודל היחיד עם עברית מאומתת**. זה כבר המודל שבשימוש (`gemini-3-pro-image-preview`) — המעבר ל-Kie חוסך ~20% ומאחד billing, בלי שינוי איכות. |
| **מועמד לבדיקת side-by-side** | `gpt-image-2-text-to-image` | ב-Kie הוא **פי 4 זול** מ-Nano Banana Pro ומוביל בטיפוגרפיה כללית (98.5% מול 94.8%), אבל עברית לא מאומתת. שווה 5 תמונות ניסיון ($0.15) — אם העברית תקינה, זה החיסכון הגדול. |
| **לא להשתמש** | FLUX / Imagen 4 / Ideogram / Seedream / SDXL | נכשלו או חלשים בעברית; SDXL גם חלש בפוטוריאליזם. |

**שורה תחתונה Q1:** *לא* לעבור ל-GPT Image 2 כברירת מחדל. GPT Image 2 מנצח בטקסט **לטיני**,
אבל לעברית הראיה היחידה שקיימת מצביעה על משפחת Gemini Image. ההמלצה: `nano-banana-2` לתמונות,
`nano-banana-pro` לאינפוגרפיקות, ובדיקה נקודתית של `gpt-image-2` כמועמד לחיסכון.

**עלות חודשית משוערת:** 30 תמונות × $0.06 + 10 אינפוגרפיקות × $0.12 ≈ **$3/חודש**.

---

# Q2 — מודל שפה (LLM)

## 2.1 נוף המודלים, אוגוסט 2026

| מודל | מזהה API | $/1M in | $/1M out | הערות |
|---|---|---|---|---|
| **Gemini 3.7 Flash** | `gemini-3.7-flash` | **$0.75** | **$3.75** | יצא 13.8.2026. "workhorse" עם tool-use ו-JSON Schema; 1M context. מחיר היכרות עד 31.12.2026 (אח"כ $1.50/$7.50). |
| Gemini 3.6 Flash | `gemini-3.6-flash` | $0.75 | $3.75 | דור קודם, אותו מחיר |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | $0.30 | $2.50 | למשימות טריוויאליות |
| **Gemini 3.1 Pro** | `gemini-3.1-pro-preview` | $2.00 | $12.00 | דגל Google. **ראשון ב-Global-MMLU-Lite (93.2%)** — הפרוקסי הרב-לשוני הטוב שיש |
| **Claude Opus 5** | `claude-opus-5` | $5.00 | $25.00 | ראשון במדדי אינטליגנציה; structured outputs נאכפים בגרמר; מצוין ב-agentic tool-use |
| Claude Sonnet 5 | `claude-sonnet-5` | $3.00 ($2 עד 31.8) | $15.00 ($10) | חלופת ביניים של Anthropic |
| GPT-5.6 Terra | `gpt-5.6-terra` | $2.00 | $12.00 | מקבילה ל-Gemini Pro |
| GPT-5.6 Sol | `gpt-5.6-sol` | $4.00 (מבצע) | $20.00 | דגל OpenAI |
| GPT-5.6 Luna | `gpt-5.6-luna` | $0.20 | $1.20 | הזול ביותר בשוק הפרונטיר |

## 2.2 הקריטריונים שלנו

**(א) עברית.** אין benchmark ציבורי עדכני שמדרג את מודלי הפרונטיר על עברית — ה-Hebrew LLM
Leaderboard (DICTA/מפא"ת) עוסק כמעט רק במודלים פתוחים, ו-Global-MMLU/BenchLM לא כוללים עברית.
מה שכן קיים: Gemini 3.1 Pro במקום ראשון ב-Global-MMLU-Lite הרב-לשוני, וכל משפחת Gemini
מתועדת רשמית כתומכת עברית (`iw`). המסקנה הכנה: **הראיות חלשות; שלושת הספקים סבירים בעברית,
ל-Google יתרון קל ומתועד**. הבדיקה האמיתית היא A/B פנימי על 5 מתכונים אמיתיים.

**(ב) פלט מובנה (JSON Schema).** OpenAI strict ≈ 99.9%, Anthropic ≈ 99.8%, Gemini ≈ 99.7% —
ההבדל זניח. אזהרה רלוונטית ל-Gemini: סכמות עמוקות/גדולות עלולות להידחות בלי מספר-תקרה מתועד.
`OPTIMIZED_STEPS_SCHEMA` שלנו שטוחה יחסית — לא בעיה.

**(ג) עלות בקנה המידה שלנו.** כמה עשרות קריאות בחודש. גם עם Opus 5 מדובר ב-**סנטים בודדים
לחודש**. עלות אינה שיקול מכריע כאן; איכות ופשטות כן.

**(ד) ארגונומיה ב-Vercel.** ה-SDK `@google/genai` כבר מותקן ומשולב (`generateContent`,
`chats.create`, `responseSchema`, `functionDeclarations`) — מעבר ל-Gemini חדש הוא **שינוי מחרוזת
אחת בחמישה מקומות**. מעבר ל-Anthropic דורש `@anthropic-ai/sdk` + כתיבה מחדש של לולאת ה-tool-calling.
Streaming לא נדרש; צריך לוודא `maxDuration` ב-route של תכנון תפריט.

**(ה) זרימה agentic (תכנון תפריט).** `menuPlannerService` הוא לולאת function-calling אמיתית
(`get_all_recipes` → `get_recipes_details_batch` → JSON מובנה, עד 8 איטרציות) עם קטלוג של עד
200 מתכונים בקונטקסט. זו המשימה הכבדה היחידה במערכת, וההבדל בין מודל חלש לחזק יורגש שם.

## 2.3 המלצות Q2

| שימוש | מודל | נימוק |
|---|---|---|
| **reformat / suggest / refine / optimize-steps** | `gemini-3.7-flash` | מחליף 1:1 את `gemini-2.0-flash-exp` השבור. אותו SDK, אותו `responseSchema`, קפיצת דורות באיכות, $0.75/$3.75. **זה השינוי המיידי והחשוב.** |
| **תכנון תפריט (menu planner)** | `gemini-3.1-pro-preview` | **כן — מגיע לו מודל חזק יותר.** ריבוי שלבים + בחירה מנומקת מתוך 200 מתכונים + JSON בסוף. עלות מוערכת ~$0.10–0.20 לתפריט, כלומר דולרים בודדים בשנה. נשאר באותו SDK ובאותה לולאה. |
| **שדרוג אופציונלי לתפריט** | `claude-opus-5` | אם התפריטים של Gemini Pro ייראו שטחיים: Opus 5 מוביל ב-tool-use agentic ובאכיפת סכמה. המחיר: SDK שני (`@anthropic-ai/sdk`), מפתח נוסף, ולולאת tool-use נפרדת. **לא לעשות מראש** — רק אם A/B מצדיק. |
| **לא מומלץ** | LLM דרך Kie | Kie מוכר גם Claude/GPT/Gemini, אבל זה מוסיף שכבת reseller (יציבות נמוכה יותר, אין ערובה ל-structured-outputs/function-calling) בשביל חיסכון של סנטים. **LLM נשאר ישיר מול Google.** |

**עלות חודשית משוערת Q2:** פחות מ-$1.

---

## 3. הערות אינטגרציה

### 3.1 שינויי מודל בקוד (5 מחרוזות)

| קובץ | היום | מוצע |
|---|---|---|
| `aiService.ts` × 4 | `gemini-2.0-flash-exp` | `gemini-3.7-flash` |
| `menuPlannerService.ts` | `gemini-2.0-flash-exp` | `gemini-3.1-pro-preview` |
| `aiService.ts` (infographic) | `gemini-3-pro-image-preview` | להשאיר כ-fallback; מסלול ראשי → Kie `nano-banana-pro` |
| `aiService.ts` (`generateRecipeImage`) | HuggingFace SDXL | Kie `nano-banana-2` |

### 3.2 משתני סביבה

| משתנה | סטטוס | תפקיד |
|---|---|---|
| `GOOGLE_API_KEY` | קיים | כל קריאות ה-LLM (Flash + Pro) |
| `GOOGLE_API_KEY_NANO_BANANA` | קיים | **להשאיר** — fallback לאינפוגרפיקה כש-Kie נופל |
| `KIE_API_KEY` | **חדש** | תמונות (`nano-banana-2`, `nano-banana-pro`) |
| `HUGGINGFACE_TOKEN` | קיים | **למחיקה** אחרי החלפת SDXL |
| `ANTHROPIC_API_KEY` | לא נדרש | רק אם יוחלט על Opus 5 לתפריטים |

### 3.3 נקודות מימוש
- **SDK:** נשארים על `@google/genai` (כבר בשימוש). אין צורך ב-Vercel AI SDK — הוא מוסיף
  שכבת הפשטה שלא צריך כשיש ספק אחד. הוא כן יהיה שווה בדיקה אם *כן* נוסיף את Anthropic,
  כי `generateObject` מנרמל structured-output בין הספקים.
- **תמונות דרך Kie:** async task (`createTask` → פולינג `recordInfo`). `nano-banana-2`
  מסיים בשניות בודדות ולכן פולינג בתוך ה-route עובד יפה — החוזה מול ה-UI לא משתנה
  (ראו `KIE_INTEGRATION_RESEARCH.md` §5.3 רמה א'). צריך `maxDuration = 120` ב-route.
- **Retention:** כל תוצר מ-Kie חייב להיות מועתק ל-Vercel Blob מיד (14 יום בלבד אצל Kie).
- **`menuPlannerService`:** בהזדמנות המעבר ל-Pro, כדאי להחליף את
  `text.match(/\{[\s\S]*\}/)` ב-`responseSchema` אמיתי — Gemini 3.x תומך ב-JSON Schema
  יחד עם function-calling, וזה מבטל את החולשה שבחילוץ JSON ברג'קס.

### 3.4 מה לבדוק לפני נעילת ההחלטה
1. A/B עברית: 5 מתכונים אמיתיים דרך `gemini-3.7-flash` מול `gpt-5.6-terra` מול `claude-sonnet-5` — האם ההבדל מורגש בעברית?
2. 5 אינפוגרפיקות: `nano-banana-pro` מול `gpt-image-2` — האם GPT Image 2 מרנדר עברית תקינה? (חיסכון פי 4 אם כן)
3. 3 תמונות מתכון: `nano-banana-2` 2K מול `nano-banana-pro` — האם ההפרש מצדיק פי 2 מחיר?

---

## 4. מקורות

- מחירי Kie ומזהי מודלים: docs.kie.ai/market/{google/nanobanana2, google/pro-image-to-image, gpt/gpt-image-2-text-to-image}; bitdoze.com/kie-ai-review; apiframe.ai/blog/gpt-image-2-api-providers
- **בדיקת עברית בתמונות (קריטית):** heyitworks.tech/blog/hebrew-image-generation-evaluation-ai-models (25.3.2026, 12 מודלים)
- בנצ'מרק תמונות 2026: atlascloud.ai — GPT Image 2 98.5% / NB Pro 94.8% / NB2 91.2% / Seedream 89.5% טיפוגרפיה
- מחירי LLM: ai.google.dev/gemini-api/docs/pricing, developers.openai.com/api/docs/pricing, platform.claude.com (Opus 5 = $5/$25)
- כיבוי Gemini 2.0 (1.6.2026) ו-2.5 (16.10.2026): ai.google.dev changelog + מדריכי מיגרציה
- רב-לשוניות: artificialanalysis.ai/evaluations/global-mmlu-lite (Gemini 3.1 Pro 93.2%)
- Hebrew LLM Leaderboard (DICTA/מפא"ת): huggingface.co/spaces/hebrew-llm-leaderboard — מודלים פתוחים בלבד, לא רלוונטי לפרונטיר

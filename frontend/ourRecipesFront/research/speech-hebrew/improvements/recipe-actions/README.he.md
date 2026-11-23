# תמלול פעולה ושלילה באמצעות רמזים מהמתכון

**הבחירה לניסוי הבא היא תיקון מקומי של פועל אחרי שלילה.** המפענח הרגיל מתמלל עם רמזי המצרכים. אם מיד אחרי ״לא״, ״ולא״, ״שלא״ או ״ושלא״ מופיעה מילה שמסתיימת ב־״תי״ ונמצאת במרחק עריכה של אות אחת או שתיים מפועל מתכון יחיד, מעבירים את אותו שמע לפענוח נוסף עם רמזי הפעולה והשלילה בעוצמה 1.5. המילה משתנה רק אם המפענח השני זיהה את הפועל, שתי המילים שלפניו והמילה שאחריו תואמות, וההקשר מופיע פעם אחת בכל תמלול. גם גבולות המשפט מובאים בחשבון. כל שאר התמליל מגיע מהפענוח הראשון. [כלל ההכרעה](retry.mjs) · [הרצת הפענוח החוזר](replay.mjs)

| מדגם | קלטים | פענוחים חוזרים | החלפות שאושרו | קלטים עם כל הביטויים הקריטיים בביקורת ובתיקון |
|---|---:|---:|---:|---|
| דיבור מדומה קודם | 96 | 5 | 2 | 72 לעומת 73. בתנאי הקצב המשתנה שוחזר גם פועל במשפט שעדיין הכיל שגיאה אחרת |
| 12 תסריטי האימות, שלושה קולות, נקי ומזיגה | 72 | 4 | 2 | 47 לעומת 49 |
| מילים דומות ותיקונים, נקי ומזיגה | 48 | 8 | 0 | 32 בשניהם |
| קריאה אנושית ורקע בלבד | 15 | 0 | 0 | התמלילים זהים בשתי הזרועות |
| ששת תסריטי הבדיקה המסכמת, נקי ומזיגה | 36 | 4 | 1 | 29 לעומת 30 |

ב־267 הקלטים הופעל הפענוח החוזר 21 פעמים (7.9%). חמש החלפות אושרו וכולן תאמו לייחוס. במדגם הפיתוח תוקן ״עוד לא יובבתי״ ל״עוד לא ערבבתי״ בהקראה של עומר בקצב קבוע. בקצב משתנה ובמזיגה אותה שגיאה נשארה. באימות התקבל ״אמרתי שלא ערבבתי״ בשתי הקראות שבהן שובש הפועל בביקורת. בבדיקה המסכמת, שהוגדרה לאחר בחירת הכלל, השיפור היחיד היה התאמת הכתיב לייחוס, מ״שלא בשלתי אורז״ ל״שלא בישלתי אורז״. מכך אין ראיה לשיפור בהבנת המשמעות על משפטים חדשים. בקטע של מזיגה בלבד הפענוח הבסיסי החזיר ״תודה רבה״, ובשקט התקבל תמליל ריק. הכלל לא שינה אותם. [תוצאות הפיתוח](dev-guarded.json) · [תוצאות האימות](holdout-guarded.json) · [מילים דומות](challenge-guarded.json) · [ביקורות](control-guarded.json) · [בדיקה מסכמת](final-check-guarded.json)

ההרצה השתמשה בפלטי הביקורת השמורים לצורך בחירת הקלטים. כל 21 הפענוחים החוזרים בוצעו בפועל בדפדפן על קלט זהה ברמת SHA-256. חציון זמן הפענוח הנוסף אחרי טעינת המפענח היה 555 מ״ש בענן (טווח 323–1,007 מ״ש). המדד אינו כולל אתחול או מעבר בין מפענחים ואינו זמן תגובה מקצה לקצה בטלפון.

אפשר להריץ את הפענוח המותנה בקוד המחקר באמצעות `transcribeWithActionCheck(pcm, verbs, decodeBase, decodeWithActionHints)`. שתי פונקציות הפענוח מחזירות טקסט ומקבלות את אותם דגימות שמע מקומיות. השנייה נקראת רק כאשר מופיעה מילה חשודה. כשל בפענוח החוזר משאיר את הטקסט המקורי. ממשק זה אומת מול כל זוגות התמלולים שנמדדו. האפליקציה עצמה טרם חוברה אליו.

### איך נבחר הכלל

ב־72 קלטי האימות, החלת רמזים על כל המשפט העלתה את מספר התמלילים עם כל הביטויים הקריטיים מ־25 ל־27 מתוך 36 בשקט ומ־22 ל־24 עם מזיגה. חלק מההבדל היה כתיב (״תיגנתי״ לעומת ״טיגנתי״). באתגר המילים הדומות, רמזי הצירופים גם שיבשו ״עוד לא הרטבתי״ שנקלט נכון בביקורת. הגברת המשקל ל־3.0 לא שיפרה את התוצאות הכוללות מול 1.5. בדקנו גם ניסיון פענוח חוזר לאחר הוספת 640 מ״ש שקט לפני השמע. ב־13 ניסיונות עם המילה החשודה לא התקבל אף תיקון מאושר; לא נבחרה הוספת שקט. הכלל שנבחר שומר את ״הרטבתי״ גם כאשר הפענוח הנוסף מחליף אותו ב״הטבתי״.


הפעולות נלקחו מההוראות של מתכון הפסטה המשמש לבדיקות בפרויקט. קבענו מיפוי ידני לארבע צורות עבר בגוף ראשון. המתמלל מקבל אותן כרמזים במהלך החיפוש האקוסטי. הרשימה אינה משתנה לפי המשפט שהוקלט. [מתכון הניסוי](../../../../tests/unit/lib/recipes/parser.test.ts) · [מיפוי הצורות](hints.json) · [תוכנית ההשוואה](PLAN.he.md)

- בביקורת השתמשנו ברמזי המצרכים ״רוטב״, ״שמן״ ו״פלפל״ ובצורות התחילית שנבדקו קודם.
- במועמד הראשון נוספו ״בישלתי״, ״טיגנתי״, ״הוספתי״ ו״ערבבתי״, עם ובלי ו׳ החיבור.
- במועמד השני נוספו גם ״לא״ ו״עוד לא״ כחלק מצירוף עם כל אחד מארבעת הפעלים. עוצמת הרמז נשארה 1.5 בשני המועמדים. במועמד שלישי הוספנו לכל שורת צירוף משקל מפורש של 3.0 והותרנו את שאר המשקלים ב־1.5. הקובץ הבסיסי מכיל 217 בתים, רמזי הפעלים 329 בתים ורמזי הצירופים 501 בתים.

בדיקת הדפדפן מפעילה אותה גרסת Zipformer2 int8 מקומית על CPU עם ארבעה מסלולי חיפוש. לא הופעל מודל נוסף. אותו קובץ PCM שימש לכל הפענוחים בכל השוואה, עם בדיקת SHA-256. מדגם הפיתוח כלל את [96 הקלטים המדומים הקודמים](../free-speech/README.he.md). מדגם האימות החדש כלל 12 משפטים בשלושה קולות מלאכותיים, במקור ועם מזיגה ב־10 דציבל. נכללו זוגות עם שלילה שנודדת בין פעולות, כוונה עתידית, תיקון ופעולות מחוץ למתכון. התסריטים והביטויים ננעלו לפני הפקת התוצאות. [משפטי האימות](holdout.json) · [ההקראות המלאכותיות](holdout-flac.zip)

ציון הביטויים דורש שכל המקטעים המסומנים יופיעו במלואם ובסדר הנכון. החלפת מילה בהומופון או הוספת תחילית עלולות להיספר כהחמצה. בנוסף נבדקו מספר מופעי ארבעת הפעלים ומילות השלילה, ועיינו בהבדלי התמלול; ספירת ״לא״ לבדה אינה מבטיחה שהשלילה מתייחסת לפעולה הנכונה. ההשוואה היא לתסריט שנשלח להקראה. מספר הקלטים כולל גרסאות תלויות של אותו משפט.

## שחזור

מתוך תיקייה זו משתמשים בסביבת המחקר המתוארת [בניסוי הדיבור המדומה](../free-speech/README.he.md). הפקודות שלהלן כותבות תוצאות ליעד חדש ב־Linux. הקוד בודק את טביעות קלטי הדיבור. ברירת המחדל של המסכם קוראת את התוצאות השמורות בענף.

```bash
python ../../prepare-models.py
python ../prepare-wasm.py
python ../free-speech/prepare.py /tmp/he-free-inputs
python ../phone/human/prepare.py
export ASR_TRIAL_OUTPUT="$(mktemp -d)"
for variant in actions negated weighted; do
  options=()
  if [[ "$variant" != actions ]]; then options+=("--$variant"); fi
  cache="$ASR_TRIAL_OUTPUT/dev-$variant"
  python prepare.py "$cache" --previous-inputs /tmp/he-free-inputs "${options[@]}"
  SPEECH_RECIPE_HINTS=1 SPEECH_HINT_ARM=hints-cookies SPEECH_NEW_CACHE="$cache" \
    SPEECH_MANIFEST="$cache/manifest.json" SPEECH_RESULT="$ASR_TRIAL_OUTPUT/dev-$variant.json" node ../fresh/run.mjs
done
for corpus in holdout challenge control; do
  cache="$ASR_TRIAL_OUTPUT/$corpus"
  python prepare.py "$cache" --previous-inputs /tmp/he-free-inputs "--$corpus"
  bash compare.sh "$corpus" "$cache"
  for variant in negated weighted; do
    bash variant.sh "$corpus" "$cache" "$ASR_TRIAL_OUTPUT/dev-$variant/cookies.txt" "$cache-$variant" "$variant"
  done
done
node evaluate.mjs --controls --challenge
node evaluate.mjs --controls --challenge --negated
node evaluate.mjs --controls --challenge --weighted
```

לשחזור הבדיקה המסכמת והתיקון הממוקד משתמשים באותה תיקיית תוצאות. כדי לבדוק את קובצי הענף יש להפעיל את המסכם והאימות ללא ASR_TRIAL_OUTPUT.

```bash
cache="$ASR_TRIAL_OUTPUT/final-check"
python prepare.py "$cache" --previous-inputs /tmp/he-free-inputs --final-check
cp "$cache/manifest.json" "$ASR_TRIAL_OUTPUT/final-check-manifest.json"
SPEECH_RECIPE_HINTS=1 SPEECH_HINT_ARM=hints-salad SPEECH_NEW_CACHE="$cache" \
  SPEECH_MANIFEST="$cache/manifest.json" SPEECH_RESULT="$ASR_TRIAL_OUTPUT/final-check-baseline.json" node ../fresh/run.mjs
for corpus in dev holdout challenge control final-check; do
  input="$ASR_TRIAL_OUTPUT/$corpus"
  if [[ "$corpus" == dev ]]; then input="$ASR_TRIAL_OUTPUT/dev-actions"; fi
  node replay.mjs "$corpus" "$input" "$ASR_TRIAL_OUTPUT/dev-negated/cookies.txt" "$input-guarded" --guarded
  if [[ "$corpus" != final-check ]]; then
    node replay.mjs "$corpus" "$input" "$ASR_TRIAL_OUTPUT/dev-negated/cookies.txt" "$input-shifted"
  fi
done
node evaluate.mjs --controls --challenge --final-check --guarded
node verify-guard.mjs
node --test retry.test.mjs
```

כדי להפיק מחדש את הקולות משתמשים ב־`../styles/generate.mjs` עם `SPEECH_PROMPTS` שמפנה ל־holdout.json, ל־challenge.json או ל־final-check.json ו־`STYLE_CACHE` שמפנה לתיקייה חדשה. ארכיוני ה־FLAC כוללים את ההפקה המדויקת שנבדקה.

הבדיקות בוצעו ב־Chromium על Linux בענן. ההקראות המקומיות הן של עומר וליאת מ־Pocket TTS ונועה מ־Piper. הייחוס לקולות כלול בארכיון. הקלטת המזיגה השנייה מתוך ESC-50 נגזרה מהקלטה של DSPena המסומנת CC0. המאגר השלם מופץ ב־CC BY-NC 3.0. הקלטות הקריאה האנושיות הן מ־Google FLEURS, ברישיון CC BY 4.0. בסבב הזה לא נמדדו טלפון פיזי או דיבור אנושי ספונטני במטבח. [ייחוס ורישיונות ESC-50](https://github.com/karolpiczak/ESC-50/blob/33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6/LICENSE) · [מקור הקלטות הקריאה](../phone/human/fixtures.json)

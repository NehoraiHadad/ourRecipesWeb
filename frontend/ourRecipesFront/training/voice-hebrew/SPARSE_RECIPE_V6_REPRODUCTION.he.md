# שחזור מחקר המודל הקטן V5–V11

העבודה בענף `codex/hebrew-cooking-voice-poc`. המקורות הוקפאו לפני GPU: V5 ב־`5cded05`, V6 ב־`6a2547d`, V7 ב־`01fa407`, V8 ב־`06b142c`, V9 ב־`e95ef0a`, V10 ב־`329fb4c` ו־V11 ב־`00ba16f`. הוראות אלה אינן מכילות פרטי חשבון, ואינן מצריכות חיבור Drive או פרסום.

## בדיקת החומר בלי משקולות או GPU

חבילת `dist/ourRecipes-replay-reference-study-20261116.zip` מכילה קוד, נתונים מלאכותיים, תוכניות קפואות, פלטים גולמיים, טוקנים, גרסאות ודוחות. MANIFEST מכיל SHA וגודל לכל קובץ. הארכיונים הגדולים עם מתאמים ומצבי אימון נשמרים בנפרד בנתיבים שב־EXTERNAL_CHECKPOINTS.json; לא מוכפלים בחבילה. אין משקולות בסיס או פרטי חשבון בחבילה.

חלצו לספרייה חדשה, ומתוכה:

```bash
python -B verify_research_packet_v6.py
```

השם היסטורי; המאמת מכסה V5–V11. הוא בודק manifest ומחשב מחדש את ציוני 5,000 הפלטים השמורים: 1,784 ב־V5, 480 ב־V6, 54 ב־V7, 54 ב־V8, 876 בכל אחד מ־V9/V10/V11. אלה חזרות על מקרי פיתוח ורגרסיה, בקרות טקסט ודוגמאות TRAIN-fit, ולא 5,000 תרחישים עצמאיים או ציון משולב. בקרות plain נבדקות בהתאמה מדויקת לטקסט המצופה, ולא במדד המתכון. 16 בדיקות forward מספריות ב־V7 נשמרות בנפרד כמדידה; השוואת הקוסינוס דורשת שחזור הסקה כדי לבדוק מחדש את הערכים עצמם. המשקולות החיצוניות אינן נבדקות בפקודה זו ואין הסקה חדשה.

לבדיקות הקוד, התקינו בסביבה נפרדת `lm-format-enforcer==0.11.3 interegular==0.3.3 pydantic==2.12.4 PyYAML==6.0.3`. הריצו unittest discover בנפרד על שמונת השמות: `test_sparse_recipe_v5.py`, `test_sparse_recipe_v6.py`, `test_sparse_recipe_v7.py`, `test_sparse_recipe_v8.py`, `test_recipe_teacher_v9.py`, `test_colab_owner_v6.py`, `test_native_scope_v10.py`, `test_adapter_scope_v11.py`. למשל:

```bash
python -B -m unittest discover -s tests -p test_native_scope_v10.py -v
```

בסך הכול 25 בדיקות חוזה, נתונים, עצירה, חשיפה ושערים. הן אינן מדידת איכות חדשה. אין צורך ב־Torch או במשקולות כדי להריץ אותן. בדיקת השחזור המקומית השתמשה ב־Pydantic 2.12.5 המותקן ובקובצי LMFE/Interegular ציבוריים בנתיב זמני; הריצות המרוחקות משתמשות בגרסאות הקפואות עם Pydantic 2.12.4.

## ביקורת מלאה עם הארכיונים המקוריים

הניחו את ארכיוני התוצאות, ה־archive-manifest וה־recovered בנתיבים היחסיים שלהם. ארבעת ארכיוני האימון הגדולים נשמרים תחת `runs/ourrecipes-sparse-v5-20261116`, `runs/ourrecipes-teacher-v9-20261116`, `runs/ourrecipes-native-v10-20261116`, `runs/ourrecipes-adapter-v11-20261116`. אין להחליף results.zip מקורי ב־ZIP החבילה הקטנה. ממאגר העבודה:

```bash
python -B sparse_recipe_audit_v5.py runs/ourrecipes-sparse-v5-20261116 --output /tmp/v5-audit-new.json
python -B sparse_recipe_audit_v6.py runs/ourrecipes-reference-v6r-20261116 --output /tmp/v6-audit-new.json
python -B sparse_recipe_audit_v7.py runs/ourrecipes-diagnosis-v7-20261116 --output /tmp/v7-audit-new.json
python -B sparse_recipe_audit_v8.py runs/ourrecipes-stop-v8-20261116 --output /tmp/v8-audit-new.json
python -B recipe_teacher_audit_v9.py runs/ourrecipes-teacher-v9-20261116 --output /tmp/v9-audit-new.json
python -B native_scope_audit_v10.py runs/ourrecipes-native-v10-20261116 --output /tmp/v10-audit-new.json
python -B adapter_scope_audit_v11.py runs/ourrecipes-adapter-v11-20261116 --output /tmp/v11-audit-new.json
```

הביקורות מסרבות לדרוס פלט קיים. הן בודקות SHA/CRC/manifest, מקורות ונתונים קפואים, ציונים והחלטות. ביקורות האימון בודקות גם מתאמים ו־CRC פנימי של resume, בלי לטעון optimizer לא מהימן ל־Torch. V9–V11 בודקות סדר 640 דוגמאות. חידוש אימון ממשי דורש את הסביבה הקפואה ואת optimizer/scaler/RNG שנשמרו; הביקורות עצמן אינן חידוש כזה.

## הרצת GPU חדשה — רק עם שם חדש

אין להריץ מחדש freeze על קובצי הקפאה קיימים. ההקפאה היא ראיה, לא הוראת הפעלה חוזרת. הרצה חדשה צורכת משאבי Colab ודורשת CLI מחובר, זהות SSH מקומית ו־T4 זמין. קובצי חשבון ומפתחות נשארים במחשב המפעיל; אין להעבירם ל־VM. כל בעלות משתמשת ב־session מפורש ובקובץ `--config` פרטי נפרד.

ל־V9 מפעילים `recipe_teacher_colab_v9.py`, ל־V10 `native_scope_colab_v10.py`, ול־V11 `adapter_scope_colab_v11.py`, עם `--session ourrecipes-<unique-run-id> --ssh-identity <private-key>` ו־`--cli` לפי ההתקנה. קובעים את GOOGLE_APPLICATION_CREDENTIALS לנתיב ADC מקומי מורשה. תהליך הבעלות מאמת את החומר, יוצר T4 אחד, מתקין Python 3.13 / Torch 2.6 + CUDA 12.4 ותלויות קפואות, מפעיל בדיקות ואז מחקר מוגבל. הורדת בסיס היא ל־VM בלבד, לפי revision ו־SHA ציבוריים.

אין לפתוח SSH או exec ידניים במקביל לתהליך הבעלות: Colab מגביל חיבורים. ריצת V6 הראשונה אבדה בעקבות HTTP429 שנגרם מקריאה מקבילה, ונשמרה ככשל תשתית. V6r משתמש באותו פרוטוקול מודל בדיוק, עם תהליך בעלות סדרתי ששומר דוחות שהושלמו בזמן הסקר. חומר התיקון ב־`verification/sparse-recipe-run-v6-20261116.json`.

ניתוק מקומי אינו מוכיח שהעבודה המרוחקת הפסיקה. אם תהליך הבעלות אבד, `recover_teacher_colab_v9.py <run-folder> --session <same-name> --ssh-identity <private-key>` ממשיך איסוף של מבנה study/model מאותו VM, כולל V10/V11, בלי להקצות נוסף. הוא מאמת SHA/CRC/manifest ומכבה אחרי איסוף מוצלח. כשל איסוף משאיר את המקור לשחזור נוסף; יש להשלים איסוף ושחרור ולא להשאיר VM סרק. עבור V5/V6 משתמשים ב־`recover_existing_colab.py`. אחרי כל ריצה מריצים audit ושומרים גם כשל.

## הבדלים שאסור לטשטש בשחזור

- V5 בפועל משתמש באצווה 8 בהסקה ובאצווה אפקטיבית 4 באימון. בתכנון V6 נכתב בטעות 4 להסקת V5; הקובץ הקפוא נשמר, והתיקון כאן. V6 משתמש באצווה 1 בכל נתיב.
- גוף המודל FP16; מתאמי PEFT נלמדים ב־FP32. שיא allocated ו־reserved ב־T4 אינם זיכרון או זמן טלפון. סטטיסטיקת האימון מאופסת אחרי הערכת הבסיס, ולכן אינה שיא כל תהליך הטעינה.
- V6/V7 השתמשו בסימן עצירה יחיד שגוי במודל הייחוס. V8 תיקן לרשימה הרשמית `[151645,151643]` גם במחולל וגם באילוץ JSON. V9 מפוקח על סוף תשובת assistant, מספר 151645, ולא על ברירת המחדל של הטוקנייזר 151643. תיקון העצירה אינו שיפור סמנטי בפני עצמו.
- V10 שומר מנוע מקורי byte-exact ומשנה נתונים בלבד; יותר טוקנים אינם FLOPs זהים. V11 שומר את נתוני V10 ומוסיף מטרות LoRA; sampler קפוא מונע שינוי סדר בגלל אקראיות האתחול, אך dropout, קיבולת וזמן אינם זהים. hash גוף שכולל שמות משתנה בין עטיפות MLP שונות; בודקים זהות לפני/אחרי בתוך הריצה, לצד מקור משקולות ו־280 פלטי בסיס זהים.
- נקודת ההחלטה V9–V11 היא 160. best_step של המנוע המקורי ב־V10/V11 הוא אבחון בלבד; אינו מחליף endpoint. אין מבחן שמור, חומר משתמש, טלפון פיזי, כימות חדש או שיחה קולית מלאה בחומר הזה.

## שימור הסביבה הקודמת

סביבת CPU זמנית שלא הייתה בשימוש נשמרה במלואה כ־gzip תחת `runs/runtime-backups`, אחרי אימות כל 27,206 הקבצים מול המקור ולפני פינוי העותק הפרוס. SHA, גרסאות ופקודת שחזור ב־`verification/sparse-recipe-runtime-storage-v6-20261116.json`. זהו ארכיון תלויות, לא משקולות מודל; הוא אינו נדרש לבדיקת הפלטים ואינו נכלל ב־ZIP הקטן. ארכיונים שפורסמו לפני העבודה נשמרו ללא שינוי.

# שחזור מחקר מתכון יחיד — CPU בלבד

הדוח הקובע הוא [SINGLE_RECIPE_RESULTS.he.md](SINGLE_RECIPE_RESULTS.he.md). זה מחקר הבנה על טקסט מלאכותי; אין בו אימון או פיילוט משתמשים.

## גרסאות ונכסים

נתיב הופעל ב־Python3.12.14, Torch2.6.0+cpu ו־Transformers4.48.3 בסביבה הקיימת `/tmp/ourrecipes-voice-training-venv`. נעשה שימוש ב־safetensors וב־AutoTokenizer מקומי. אין תלות ב־GPU, Colab או מפתח שירות הסקה.

קוד ומשקולות נתיב: [revision קפוא](https://huggingface.co/yoavipo/nativ-he-decision/tree/0e78cb9df435213e84c4d0617a363c8ebe183f31). להוריד `model.safetensors`, `decider.py`, `config.json`, `tokenizer.json`, `tokenizer_config.json` לתיקיית נכסים מקומית. המשקולות הן727,560,706B וב־SHA256 `2a3dd16c1d7bd024df775e023ac6b357b14b7d1cf07d3de9938d61d589312a30`.

נדרשים גם `config.json` ו־`modeling_neobert.py` מ[גרסת ה־encoder](https://huggingface.co/dicta-il/neodictabert/tree/9052b2e47fe3e615931563bb2a74b26df6e028a3), בשמות המקומיים `base-config.json` ו־`base-modeling_neobert.py`. המקורות שנבדקו נמצאים גם ב־`verification/nativ-inspection-20261116`; ה־tokenizer והמשקולות נשארו מחוץ ל־Git ולחבילת התוצאות. רישיוןCC-BY4.0 וייחוס ל־yoavipo/DICTA מתועדים עם המקורות. אין צורך להוריד גם משקולות בסיס: ה־loader שלנו בונה את המבנה מה־config וטוען את כל174 הטנזורים שב־checkpoint נתיב ב־strict. כך נחסכת הורדה נוספת של כ־922MB.

Qwen משתמש בקובץ GGUF ובבינאריCPU שנבנו בשלב1. גרסאות, גיבובים והוראות בנייה ב[הוראות הבקרה הקודמות](PARITY_REPRODUCTION.he.md) ובתוכניות הניסוי. המשקולות Q4 הן396,705,472B וב־SHA256 `ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a`.

## הרצות

מהתיקייה `training/voice-hebrew`, עם Python בסביבה המתאימה:

```sh
python single_recipe_study.py --arm nativ --tag REPLAY-json --plan verification/single-recipe-plan-20261116-compatible.json
python single_recipe_study.py --arm qwen --tag REPLAY-json --plan verification/single-recipe-plan-20261116-compatible.json
python single_recipe_study.py --arm nativ --tag REPLAY-compact --plan verification/single-recipe-plan-20261116-compact.json
python single_recipe_study.py --arm qwen --tag REPLAY-compact --plan verification/single-recipe-plan-20261116-compact.json
```

כל תיקיית ריצה חייבת להיות חדשה. לא להריץ את המודלים במקביל אם משווים את הזמנים על אותם4CPU. `nativ-v1` המקורי הופעל לפני הוספת ארגומנט `--plan`; מקורו הקפוא ב־commit `f46838f`. השינוי היחיד ב־runner התואם הוא אפשרות לבחור קובץplan; קלטי הבסיס נשמרו ללא שינוי. מקור הווריאנט התמציתי וה־runner התואם ב־`a378c5a`. בחבילת המסירה נשמרים snapshots לכל תוכנית.

התוכנית קובעת נתיבים וגיבובים של מודל, runtime, מקור ונתונים, וה־runner מסרב להמשיך אם אינם תואמים. במכונה אחרת יש ליצור **תוכנית נגזרת חדשה** עם הנתיבים והגיבובים המתאימים, לשמר את המקור הקפוא ולא לשכתב ריצות קיימות. קלטים/מדדים/מודל שלא שונו צריכים להישאר זהים. אין להריץ מחדש את הגנרטור ולשנות תאריך בנתונים המקוריים: התאריך הוא חלק מגיבוב הקובץ.

אחרי ההרצות:

```sh
node single_recipe_report.mjs runs/single-recipe-v2/nativ-REPLAY-json/result.json runs/single-recipe-v2/qwen-REPLAY-json/result.json runs/single-recipe-v2/nativ-REPLAY-compact/result.json runs/single-recipe-v2/qwen-REPLAY-compact/result.json
```

הדוח נכתב ל־`verification/single-recipe-results-20261116.json`; לצורך שחזור יש להעתיק את המקור למיקום נפרד או להריץ ב־checkout נפרד, כדי לשמר את תוצאת המחקר המקורית. פלט לא תקין נחשב כשל ונשאר במכנה של שינויים נדרשים/מקרים ללא שינוי.

## האבחון הקטן ובדיקות קוד

`single_action_probe.py --arm nativ` ו־`--arm qwen` מריצים אבחון נפרד בן16 שאלות, לפי `verification/single-action-probe-plan-20261116.json`. גם כאן אין לדרוס תיקיות קיימות: לבצע שחזור בספרייה נפרדת. המקור הוקפא ב־`288a808`. הוא אינו עוד וריאנט על80 המקרים ואין לערבב את ציונו בדוח הראשי.

בדיקות הקוד דורשותNode בלבד:

```sh
node --test --test-reporter=tap recipe_contract_v1.test.mjs recipe_development_v1.test.mjs tiny_recipe_cases.test.mjs decision_protocol_v2.test.mjs single_recipe_report.test.mjs
```

אלה בדיקות תקינות נתונים, הפרדת הקשרים, מאמת ומכני מדדים. הן אינן תוצאות איכות של מודל. מקורv1 והמטא־נתונים שלו נשמרו כפי שהיו בעת יצירתם; שדות כמו `modelInferencePerformed:false` שם מתארים את יצירת ערכתשלב1, ולא מבטלים את הרצותv2 המאוחרות יותר.

## אחסון ופרטיות

לפני הורדת נתיב נשמרה רזרבת אחסון, ונוקו רק קובצי build ניתנים לשחזור של מנוע הייחוס. הבינארים, הספריות, לוגי הבנייה, המשקולות וכל הארכיונים הקודמים נשמרו; לפני ואחרי הניקוי נבדקו ספריות הייחוס בגיבוב. הפירוט ב־`storage-preparation.json`.

אחרי ההורדות נתיב הופעל במצבoffline. שרתQwen נקשר ל־127.0.0.1 בפורט זמני ונסגר בסיום. רק טקסטי פיתוח שלנו נשלחו אליו. אין משלוח תוכן משתמש לשירות חיצוני ואין הרצה של מבחנים שמורים. אין בחבילה משקולות, אודיו, credentials או תוצאות מכשיר פיזי.

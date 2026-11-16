# שחזור פיילוט עובדות דלילות

הפרוטוקול הקובע: [SPARSE_RECIPE_PILOT_PLAN.he.md](SPARSE_RECIPE_PILOT_PLAN.he.md). תוכנית ממוכנת: [sparse-recipe-plan-v3](verification/sparse-recipe-plan-v3-20261116.json). המקור הוקפא ב־`9ffadab` לפני הקצאתT4. כלי הדוח והבחנת עדכון שגוי/השמטה ב־`c8a08cd` אינם משנים את בחירתcheckpoint או שער ההמשך. מקור כרטיס המודל נשמר byte-exact, כולל whitespace שלupstream.

## שחזור בדיקות ונתונים

מתוך `frontend/ourRecipesFront/training/voice-hebrew`:

```sh
python -m unittest discover -s tests -p 'test_sparse_recipe*.py' -v
```

אל תריצו את `sparse_recipe_data_v3.py` מעל נתונים קיימים: הוא מסרב לדרוס אותם. לשחזור גנרטור בלי לשכתב:

```sh
python - <<'PY'
import json, hashlib
from pathlib import Path
from sparse_recipe_data_v3 import build, DATA
raw = (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode()
assert raw == DATA.read_bytes()
print(hashlib.sha256(raw).hexdigest())
PY
```

## Colab וסביבת האימון

נדרשים חיבורColab מאושר, הרשאה להקצאתT4 ומפתחSSH מקומי שכבר הוגדר ל־CLI. אין לכלול credentials בחבילה או ב־Git. בוחרים שם ריצה חדש; לעולם לא דורסים תיקיית ריצה או משתמשים מחדש בשם המקורי.

```sh
GOOGLE_APPLICATION_CREDENTIALS=/absolute/private/authorized-user.json \
python -u sparse_recipe_colab.py \
  --session ourrecipes-sparse-v3-REPLAY \
  --ssh-identity /absolute/private/ssh-key
```

להחליף את `REPLAY` באותיות קטנות/ספרות/מקפים; ה־runner דורש שם`ourrecipes-*` ייעודי. נתיבי ההתחברות הם דוגמאות, אין בחבילה קובצי התחברות. `usage` נשמר תחת ריצה מוחרגת מ־Git ואינו חלק מחבילת המחקר. ה־owner משתמש ב־ADC ובקובץ sessions ייעודי כדי לא לערבב ריצות; משחרר רק את הסביבה ששמה ניתן לו. אין להפעיל אותו בלי ההרשאה והמשאבים המתאימים.

ה־job יוצר venv חדש ב־Python3.13, מתקיןTorch2.6.0+cu124 ואת הגרסאות הקפואות שבתוכנית. `pip-freeze.txt` שומר גם תלויות עקיפות. הוא מוריד רק נכסים ציבוריים מה־revision המאומת. משקולות המקור1.50GB נדרשות בשרת האימון, לא נכנסות לחבילת המחקר ולא הופכות בכך להורדת דפדפן. לא נדרשיםHub token, mountDrive או מפתח הסקה חיצונית.

יש להוריד מחדש את אותו מקור ציבורי וב־SHA המתועד כדי לשלב מתאם בעתיד. ההרצה כוללת baselineFP16 ומתאם על אותו גוף, הנחיה ו־decoder. אין להשוות את ההפרש לציוניQ4 קודמים כאילו מדובר בשינוי אימון בלבד. ההפקה היאgreedy ובליgrammar/תיקון פלט; הסכמה נאכפת רק במאמת שמנקד/דוחה את התשובה. ההסקה אינה ניסוח תשובה למשתמש.

## תוצרים ושחזור מדדים

תחת `runs/SESSION/`: חבילת חומר מקורית, סטטוס בעלות, `results.zip`, גיבוב ומניפסט, לוג שרת ותיקיית`recovered`. התוצאה מאומתת ב־SHA/CRC ובכל רשומתmanifest לפני חילוץ. אם אין מקום לכפול את משקולות המתאם, הן נשמרות בארכיון המאומת ומחולצים רק קובצי ראיות קטנים. כלcheckpoint מתוכנן שומר מתאם, אופטימייזר, scaler, סדר הדוגמאות ומצביRNG. **שחזור אימון מאמצעcheckpoint עדיין לא נבדק**; אין להציג עצם שמירתם כהוכחת resume מוצלח.

```sh
python sparse_recipe_report.py runs/SESSION \
  --output verification/sparse-recipe-results-REPLAY.json
```

הדוח מסרב לדרוס פלט קיים, בודק את מזהי כל120 הרשומות מול הנתונים, מחשב מחדש את המדדים ומאמת שלא השתנו מול הדוח המרוחק. שדה`unsafe_state` המקורי אינו מדד נקי לשינוי שגוי שבוצע: הוא מערבב עובדה שגויה וכל מצב סופי שגוי, שיכול לנבוע מהשמטה. משתמשים במונה המשני המפורש לשינוי מוצע שונה מהמצב הקודם ומהמצב הצפוי; התיקון מתועד ואינו משנה את שער ההמשך המוקפא, המבוסס על עובדות/דיוק/כיסוי.

גם שיפור גדול ב־validation הזה אינו הוכחת שיחה טבעית, כימות, עברית קולית או התאמה לטלפון. אין לפתוח את המבחנים השמורים הוותיקים רק לשחזור הפיילוט.

ניתוח38 הכשלים והעקומה ניתן לאימות בלי הסקה נוספת:

```sh
python sparse_recipe_error_review.py runs/SESSION \
  --verify-against verification/sparse-recipe-errors-v3-20261116.json
```

בארכיון מסירה שמכיל רק את `results.zip` המקורי, יש לחלץ ממנו קודם את קובציJSON/JSONL של `study` לתיקיית `runs/SESSION/recovered`, בלי לדרוס ריצה קיימת.

# שחזור בדפדפן

הפקודות רצות מתיקיית improvements עם סביבת המחקר של הפרויקט, Chromium, ‏Playwright, ‏FFmpeg, ‏NumPy ו־SciPy. ספריית היעד בכל פקודה צריכה להיות חדשה. מסך המחקר טוען את המודל מאותו מקור אחרי לחיצת המשתמש. אין צורך ב־GPU.

```sh
python phone/build.py /tmp/asr-base
python phone/build.py /tmp/asr-expanded --competing-verbs
python phone/build.py /tmp/asr-fallback --competing-verbs --preserve-recipe-pass
python time-window/fixtures.py /tmp/asr-fresh --corpus competing-verbs
python time-window/fixtures.py /tmp/asr-contrast --corpus competing-verbs/contrast
python time-window/fixtures.py /tmp/asr-development
```

שני הארכיונים new-voices.zip שומרים את המקורות הסינתטיים בפורמט FLAC עם ייחוס לקולות. הכנת הדוגמאות מוסיפה גרסת מזיגה ב־10 דציבל באמצעות אותו קובץ ESC-50 מוצמד ומאומת מהניסוי הקודם. הדפדפן מוודא שטביעת SHA-256 של האודיו שהוא פענח זהה לייחוס. להאזנה מחדש ללא סינתזה משתמשים בפקודות לעיל. דרך יצירת המקורות הייתה הפעלת styles/generate.mjs עם SPEECH_PROMPTS מצביע ל־new-cases.json ו־STYLE_CACHE לתיקיית קולות חדשה, והעברת התיקייה ל־fixtures.py עם ‎--voices בשלב יצירת ארכיון המקור. יצירה מחודשת של TTS עשויה להניב שמע שונה. [מקור המזיגה והרישיון](../time-window/README.he.md)

דוגמה להשוואת שתי גרסאות על אותו קלט. באותו אופן מחליפים את המקור ב־asr-contrast או ב־asr-development ואת האתר ב־asr-expanded.

```sh
node time-window/screen.mjs /tmp/asr-base /tmp/asr-fresh /tmp/base.json
node time-window/screen.mjs /tmp/asr-fallback /tmp/asr-fresh /tmp/fallback.json
```

לבקרות משתמשים בחמש תיקיות ה־PCM של ניסוי recipe-actions. בנינו מחדש WAV בדיוק מהדגימות שדרשו פענוח נוסף בגרסה הקודמת. 246 הקלטים האחרים מאותו סבב לא דרשו בדיקה חוזרת בגרסה המקורית והם אינם חלק ממדידת 21 הבקרות. בדיקת התזמון חוזרת על שלושה קבצים שלוש פעמים באותה לשונית, תחילה באתר המקורי ואז באתר המשופר.

```sh
python competing-verbs/controls.py /tmp/asr-controls DEV HOLDOUT CHALLENGE CONTROL FINAL
node time-window/screen.mjs /tmp/asr-fallback /tmp/asr-controls /tmp/controls.json
python competing-verbs/latency.py /tmp/asr-latency /tmp/asr-fresh /tmp/asr-controls
node time-window/screen.mjs /tmp/asr-base /tmp/asr-latency /tmp/time-base.json
node time-window/screen.mjs /tmp/asr-fallback /tmp/asr-latency /tmp/time-fallback.json
node --test competing-verbs/reconcile.test.mjs recipe-actions/retry.test.mjs time-window/window.test.mjs
node competing-verbs/compare.mjs
node competing-verbs/compare.mjs --preserved
```

שתי הפקודות האחרונות מאמתות את זוגות התמלילים והמדדים השמורים במאגר. לצורך מדידה עצמאית שומרים את פלטי המסך החדשים בשמות המקבילים בעותק נפרד של תיקיית המחקר. פלט השדה previous במסך מתאר את הטקסט אחרי הפענוח החוזר הראשון של המשפט המלא. להשוואה בין גרסאות משתמשים ב־final האוטומטי של כל זרוע. תשובת משתמש ידנית נרשמת בנפרד.

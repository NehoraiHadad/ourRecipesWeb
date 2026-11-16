# שחזור בקרת native מול דפדפן — שלב1

המקור והתוכנית הוקפאו לפני ההסקה. זה מחקר פיתוח מקומי, ללא טקסט משתמש או שירות הסקה חיצוני. אין צורך ב־GPU או בחיבור Colab בשביל בדיקה זו.

## תלויות וקלטים

- Node עם Playwright ו־Chromium כפי שמותקנים בפרויקט; Wllama3.13.0 המקומי ב־`public/voice/runtime/llm`.
- Python3 עם ספרייה סטנדרטית, cmake3.31.6, make ו־g++14.2 בבדיקה שבוצעה. אפשר להתקין cmake בסביבה מבודדת; שינוי compiler עשוי לשנות SHA של הבינארי.
- Qwen3-0.6B-Q4_K_M.gguf, ‏396,705,472B, גרסת Unsloth הקפואה50968a4468ef4233ed78cd7c3de230dd1d61a56b. SHA256: `ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a`. כתובת מלאה בתוכנית; רישיון המודל Apache2.
- [מקור llama.cpp](https://github.com/ggml-org/llama.cpp/archive/7d7f0287530bc8981690f361d8c1627dbae1c99a.tar.gz), commit שתואם את submodule של Wllama3.13.0. גיבוב ארכיון: `2f15b173875f53cb2a3d099b65875a24824859b0b9a7ede276d58ec2881ae085`, ‏39,142,448B. רישיון MIT. קוד Wllama/llama מקורי לא שונה.

המשקולות הורדו ואומתו ב־`/tmp/voice-models/llm`. מקור דחוס, מטא־נתונים, רישיון ולוג בנייה נשמרו ב־`/tmp/voice-parity-native`. עץ המקור המחולץ ומטמון compiler של Next הוסרו כדי לפנות אחסון; ארכיוני ניסויים, checkpoints ומשקולות קודמים נשמרו. אין להסתמך על `/tmp` כחבילת מסירה ניידת; כתובות ו־SHA מתועדים כדי לאפשר השבה.

## בניית מנוע הייחוס

לחלץ את הארכיון בספריית כלים נפרדת. בתיקיית המקור להריץ:

```sh
/tmp/voice-parity-tools/bin/cmake -S . -B /tmp/voice-parity-native/build \
  -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF \
  -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_APP=OFF \
  -DLLAMA_BUILD_UI=OFF -DLLAMA_OPENSSL=OFF \
  -DLLAMA_BUILD_COMMIT=7d7f0287530bc8981690f361d8c1627dbae1c99a
/tmp/voice-parity-tools/bin/cmake --build /tmp/voice-parity-native/build --target llama-server -j 4
```

הבינארי והספריות ב־`build/bin` צריכים להישאר יחד. בגרסה הזו דגל הטעינה הוא `--load-mode none`; הדגל הישן `--no-mmap` אינו מתקבל. הדגלים המלאים והגיבובים נמצאים בתוכנית ובכל תוצאה.

## ריצה וניתוח

מתיקיית `training/voice-hebrew`:

```sh
node --test recipe_contract_v1.test.mjs recipe_development_v1.test.mjs tiny_recipe_cases.test.mjs
python3 parity_report.py runs/browser-native-parity/20261116-qwen06-v7-no-logprobs/result.json
```

ה־runner מסרב לדרוס תיקיית ריצה ומוודא גיבובי מקורות, runtime, משקולות ובינארי לפי `verification/browser-native-parity-plan-20261116.json`. **התוכנית הנוכחית היא אבחוןv11 של טוקן המשך יחיד**, עם שימוש חוזר בתצפיותchat מ־v7/v8. `node parity_runner.mjs UNIQUE-RUN-ID` יריץ אותה, ולא השוואת14 חדשה. תצפיות משומשות אינן מוצגות כהרצותchat נוספות.

ההשוואה המלאה היאv7, שהוקפאה ב־commit `9030ea0`; תוכניתה נשמרה גם כ־`verification/browser-native-parity-plan-20261116-v7.json`. יש להשתמש בקוד ובתוכנית מאותה גרסה, בספרייה/checkout מבודדים עם תלויות הפרויקט ונכסיruntime לפי הגיבובים. החבילה מכילה גם snapshots של המקורות לכל גרסת הכנה. לשחזור מלא במכונה חדשה יש להקפיא תוכנית נגזרת חדשה עם הנתיבים והגיבובים החדשים; אם משתמשים בגרסה שמכילה `reuse_native_result` או `reuse_browser_result`, להסיר אותם ואת artifacts התוצאות הקודמות לצורך תצפיות חדשות. אין לשכתב את התוכנית או הפלטים המקוריים ואין לערבב קוד חדש עם SHA של קוד קודם.

שרת הייחוס מאזין רק ב־127.0.0.1:18761. יש לבחור ריצה כשפורט זה פנוי; אין להרוג תהליך אחר כדי לפנותו. דפדפן ייעודי חדש משמש את הבדיקה ונסגר בסיום. נתוני ההשוואה המלאה הם ארבע בקרות קיימות ועוד עשרה תרחישיV19 מובנים; אבחוני ההמשך מסומנים בנפרד. ערכת80 החדשה אינה מופעלת בניסוי הזה.

## בקרות טעינת הקובץ

נשמרו בדיקות הובלה נפרדות: קריאת מקטעים, `response.blob()`, פרופיל קבוע וחלון incognito. קובץ באותו גודל נקרא במלואו ב־incognito ובשיטת reader בפרופיל קבוע, אך קריאת `response.blob()` בפרופיל הקבוע נכשלה ב־`net::ERR_FAILED`. לכן שיטת ההובלה הוחלפה ל־reader/Blob שלV19. זה אינו כשל מתועד של המודל, וגם לא הוכחה שהגורם הפנימי ב־Chromium הוא דווקא מכסת אחסון. שינוי ה־routing לבדו לא פתר את התקלה. כל גרסאות ההכנה והתוצאות החלקיות נשמרו.

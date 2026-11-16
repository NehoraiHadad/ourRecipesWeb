# שחזור V5/V6 ושמירת החומר

העבודה בענף `codex/hebrew-cooking-voice-poc`. חומרV5 הוקפא ב־`5cded05`; תוצאותיו ותכנוןV6 ב־`6a2547d`. הוראות אלה נפרדות ממפתחות/חשבונות והן אינן מכילות פרטי התחברות. לא מחברים Drive ולא מפרסמים חומר לצורך השחזור.

## בדיקת ראיות בלי GPU

חבילת `dist/ourRecipes-replay-reference-study-20261116.zip` מכילה קוד, נתונים, פלטים גולמיים, טוקנים, גרסאות, דוחות ו־MANIFEST. היא אינה מכילה משקולות בסיס או את ארכיון המשקולות הגדול שלV5; מיקומו וה־SHA שלו רשומים ב־EXTERNAL_CHECKPOINTS. שמירת חומר קטן לחוד ממשקולות מאפשרת בדיקה בלי הורדה גדולה נוספת.

אחרי חילוץ לספרייה חדשה, מהשורש שלה:

```bash
python -B verify_research_packet_v6.py
python -B -m unittest discover -s tests -p test_sparse_recipe_v5.py -v
```

הפעולה הראשונה בודקת manifest ומחשבת מחדש1784 פלטיV5 ו־480 פלטיV6; היא אינה הסקה חדשה ואינה בודקת את המשקולות החיצוניות. ה־1784 כוללים חזרות על אותם מקרי פיתוח,72 דוגמאות TRAIN-fit ו־32 אבחוני שפה, ולא1784 תרחישים עצמאיים. לבדיקת parserV6 התקינו בסביבה נפרדת `lm-format-enforcer==0.11.3 interegular==0.3.3 pydantic==2.12.4 PyYAML==6.0.3` והריצו `test_sparse_recipe_v6.py`. אין צורך ב־Torch או GPU לבדיקות אלו.

## ביקורת מלאה עם הארכיונים המקוריים

שמרו את ארכיוןV5 המקורי בנתיב היחסי הרשום, ואת ארכיוןV6 וה־archive-manifest שלו ב־`runs/ourrecipes-reference-v6-20261116`. אין להחליף את ארכיוןV5 ב־ZIP הפלטים הקטן. ממאגר העבודה:

```bash
python -B sparse_recipe_audit_v5.py runs/ourrecipes-sparse-v5-20261116 --output /tmp/v5-audit-new.json
python -B sparse_recipe_audit_v6.py runs/ourrecipes-reference-v6-20261116 --output /tmp/v6-audit-new.json
```

מאמתV5 מסרב לדרוס קובץ פלט קיים. הביקורות בודקות SHA/CRC/manifest, התאמה למקורות ולנתונים הקפואים, כל ציוני הפלט והחלטות. V6 בודק גם את מקור המתאם בתוך הארכיון המקורי. אין בפקודות אלה שימוש בחשבון, GPU או הסקה.

## הרצה חדשה שלV6

הרצה חדשה צורכת משאביColab ואינה חלק מבדיקת החבילה. נדרשים CLI מחובר במחשב המפעיל, זהותSSH פרטית ו־T4 זמין. השתמשו ב־ADC וב־session ייעודי עם `--config`, לפי colab-operator. אין להעביר קובצי חשבון ל־VM.

1. ודאו שכל SHA במפרטV6 תואם. חלצו רק `adapter_config.json` ו־`adapter_model.safetensors` מ־`study/diverse/checkpoint-160/` בתוך ארכיוןV5 אל `/dev/shm/voice-v6/adapter/`. בדקו מול `artifact_sha256`. אין צורך לחלץ optimizer או לשנות את המקור. `sparse_recipe_freeze_v6.py` מתעד כיצד הוכן החומר, אך אין להריץ אותו מחדש על קובצי הקפאה קיימים.
2. קבעו `GOOGLE_APPLICATION_CREDENTIALS` לנתיב הפרטי במחשב המפעיל. הפעילו `sparse_recipe_colab_v6.py --session ourrecipes-reference-v6-<run-id> --ssh-identity <private-key>`. בעלות הריצה יוצרתT4 אחד, מאמתת חומר, מתקינה Python3.13/Torch2.6+cu124 ותלויות קפואות, מפעילה בדיקות, ואז את שלוש זרועות ההסקה. השם חייב להתחיל `ourrecipes-`; אין להשתמש בשם ריצה קודמת.
3. המתינו לארכיון שנבדק ולשחרורVM. ניתוק של תהליך הבעלות המקומי אינו הוכחה שהעבודה המרוחקת הפסיקה. בדקו קודם את ה־session הקיים; `recover_existing_colab.py <run> --session <same-name> --ssh-identity <private-key>` משחזר מאותוVM בלי להקצות נוסף, ומשחרר אותו אחרי איסוף תקין. בכשל איסוף הוא משאיר את המקור לשחזור; יש לסיים איסוף ושחרור ולא להשאירVM סרק.
4. הריצו audit על הריצה החדשה, ושמרו גם כשל. משקולות בסיס מורדות רק ל־VM לפי רוויזיה ו־SHA, ואינן נכללות ב־ZIP התוצאות. אין ב־V6 אימון או עדכון מתאם.

כל פלטV6 משתמש בתבנית שיחה רשמית, FP16, batch1, greedy, תקציב1024/96. הדוחות כוללים מגבלת טוקנים, זמן לטעינה ולבניית אינדקס grammar, זמן יצירה וזיכרוןGPU. אלה אינם זמני טלפון. הפעלה בדפדפן, כימות, מענה שיחתי ותמלול/הקראה דורשים ניסויים נפרדים.

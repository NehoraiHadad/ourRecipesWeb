"""Build a plain-Python-cell Colab notebook; no execution on open."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
cells=[]
def md(text):cells.append({"cell_type":"markdown","metadata":{},"source":text.splitlines(keepends=True)})
def code(text):cells.append({"cell_type":"code","metadata":{},"execution_count":None,"outputs":[],"source":text.splitlines(keepends=True)})
md('''# אימון ניסיוני של זיהוי דיווחי בישול בעברית

המחברת מתאימה את **DictaBERT-tiny** לסיווג כוונה ופעולות לפי מתכון ומצב.
זהו ניסוי בזיהוי התקדמות, ולא אימון של התמלול או קול ההקראה.
הנתונים המצורפים מלאכותיים וטרם עברו בדיקה אנושית. אין כאן עדיין מודל שהוכח כשמיש.

לפני התחלה: בתפריט **Runtime → Change runtime type** בחרו GPU. הזמינות בחינם אינה מובטחת.
מחברת זו אינה מפעילה אימון עד שמריצים את תא האימון.
ראו `README.he.md` בחבילה להסבר מלא ולמסלול Modal.
''')
md('''## 1. העלאת חבילת החומר
במחשב העבודה בונים ZIP עם `python prepare.py --bundle dist/colab-materials.zip`.
מעלים רק את ה־ZIP הזה. הוא כולל נתוני דמה וקוד; אין צורך להעלות את האפליקציה או הקלטות.
העלאת הקובץ ל־Colab מעבירה את החומר לחשבון Google שלכם.
''')
code('''from google.colab import files
import pathlib, tempfile, zipfile, json, subprocess, sys, os
uploaded = files.upload()
assert len(uploaded) == 1, "יש לבחור קובץ ZIP אחד"
name = next(iter(uploaded))
assert name.endswith(".zip"), "נדרשת חבילת ZIP"
WORK = pathlib.Path(tempfile.mkdtemp(prefix="ourrecipes-", dir="/content"))
with zipfile.ZipFile(name) as archive:
    assert sum(i.file_size for i in archive.infolist()) < 20 * 1024 * 1024, "חבילת החומר גדולה מהצפוי"
    for info in archive.infolist():
        relative = pathlib.PurePosixPath(info.filename)
        assert not relative.is_absolute() and ".." not in relative.parts
    archive.extractall(WORK)
subprocess.run([sys.executable, str(WORK / "plan.py")], check=True, cwd=WORK)
print("תיקיית העבודה:", WORK)
''')
md('''## 2. סביבת Python נפרדת
ההתקנה הראשונה מורידה ספריות ומשקולות ציבוריות בהמשך. היא יכולה להימשך כמה דקות.
משתמשים בסביבה נפרדת כדי לא לשנות את ספריות Colab המובנות.
''')
code('''assert (3, 10) <= sys.version_info[:2] <= (3, 12), "חבילה זו נבדקה עם Python 3.12; נדרשת גרסה 3.10–3.12"
ENV = pathlib.Path("/content/ourrecipes-training-venv")
if not (ENV / "bin/python").exists():
    subprocess.run([sys.executable, "-m", "venv", str(ENV)], check=True)
PY = str(ENV / "bin/python")
subprocess.run([PY, "-m", "pip", "install", "torch==2.6.0", "--index-url", "https://download.pytorch.org/whl/cu124"], check=True)
subprocess.run([PY, "-m", "pip", "install", "-r", str(WORK / "requirements.txt")], check=True)
subprocess.run([PY, "-c", "import torch; print(torch.__version__, torch.cuda.get_device_name() if torch.cuda.is_available() else 'No GPU'); assert torch.cuda.is_available(), 'בחרו GPU בסוג סביבת ההרצה'"], check=True)
''')
md('''## 3. שמירת התוצאות
`USE_DRIVE=True` שומר נקודות שחזור ותוצאות ב־Google Drive שלכם ודורש הרשאה דרך Google.
כך ניתן להמשיך אם סביבת Colab מתנתקת. עם `False` הקבצים זמניים ויש להוריד אותם לפני סגירה.
בחרו שם חדש לניסוי חדש; לשחזור של אותה ריצה השתמשו באותו שם וב־`RESUME=True` בתא הבא.
''')
code('''USE_DRIVE = True
RUN_ID = "pilot-001"
if USE_DRIVE:
    from google.colab import drive
    drive.mount("/content/drive")
    STORAGE = pathlib.Path("/content/drive/MyDrive/ourrecipes-voice-training")
else:
    STORAGE = pathlib.Path("/content/ourrecipes-voice-results")
STORAGE.mkdir(parents=True, exist_ok=True)
RUN = STORAGE / RUN_ID
TRAIN_ENV = {**os.environ, "HF_HOME": str(STORAGE / "hf-cache"), "HF_HUB_DISABLE_TELEMETRY": "1", "TOKENIZERS_PARALLELISM": "false"}
print("תוצאות:", RUN)
''')
md('''## 4. אימון ראשון מוגבל
עד 200 צעדי אימון או 10 דקות, כולל טעינת המודל. ההגבלה אינה הבטחת עלות.
נקודת שחזור נשמרת כל 25 צעדים. לצורך ניסוי טכני זעיר אפשר להתחיל ב־`STEPS=10`.
אל תשנו את מספר הצעדים בעת שחזור; לניסוי בהגדרות אחרות בחרו `RUN_ID` חדש.
''')
code('''STEPS = 200
RESUME = False
command = [PY, str(WORK / "train.py"), "--data", str(WORK / "data"), "--output", str(RUN), "--max-steps", str(STEPS), "--max-seconds", "600", "--save-every", "25", "--require-gpu"]
if RESUME:
    command.append("--resume")
subprocess.run(command, check=True, cwd=WORK, env=TRAIN_ENV)
report = json.loads((RUN / "training-report.json").read_text())
print(json.dumps({k:v for k,v in report.items() if k != "validation"}, ensure_ascii=False, indent=2))
if not (RUN / "decision.json").exists():
    print("הזמן הסתיים לפני השלמת האימות. ממשיכים מאותה נקודת שחזור עם RESUME=True.")
''')
md('''## 5. מבחן נפרד — רק אחרי שבחרתם את הריצה
סף הביטחון נבחר מקבוצת האימות במהלך האימון. קבוצת המבחן לא השתתפה באימון.
לא משתמשים בתוצאות המבחן שוב ושוב כדי לשפר את אותה ריצה.
חפשו במיוחד עדכונים שגויים, טיפול בתיקונים וכיסוי של פעולות. דיוק כללי לבדו מטעה.
''')
code('''assert (RUN / "decision.json").exists(), "יש להשלים אימות לפני המבחן"
subprocess.run([PY, str(WORK / "evaluate.py"), str(RUN), "--data", str(WORK / "data"), "--split", "test"], check=True, cwd=WORK, env=TRAIN_ENV)
''')
md('''## 6. ייצוא מועמד להרצה מקומית
נוצרים ONNX וגרסת INT8 קטנה יותר, עם בדיקת התאמה מספרית ותיעוד הרישיון.
עדיין צריך לבדוק דיוק לאחר הקטנה, התאמת פענוח הטקסט בדפדפן ומכשיר אמיתי.
הייצוא אינו מתקין או מפעיל את המודל באפליקציה.
''')
code('''subprocess.run([PY, str(WORK / "export.py"), str(RUN), "--data", str(WORK / "data")], check=True, cwd=WORK, env=TRAIN_ENV)
print((RUN / "onnx/export-report.json").read_text())
subprocess.run([PY, str(WORK / "evaluate.py"), str(RUN), "--data", str(WORK / "data"), "--split", "test", "--onnx"], check=True, cwd=WORK, env=TRAIN_ENV)
''')
md('''## 7. הורדת המועמד והתוצאות
ה־ZIP להורדה כולל את גרסת INT8, הטוקנייזר ודוחות. נקודת השחזור המלאה נשארת בתיקיית הריצה.
אחרי סיום: נתקו את סביבת ה־GPU דרך Runtime כדי לפנות אותה.
''')
code('''result_zip = pathlib.Path("/content") / (RUN_ID + "-results.zip")
with zipfile.ZipFile(result_zip, "w", zipfile.ZIP_DEFLATED) as archive:
    for item in (RUN / "onnx").rglob("*"):
        if item.is_file() and item.name != "model.onnx":
            archive.write(item, item.relative_to(RUN))
    for name in ["run-config.json", "training-report.json", "validation.json", "evaluation-test.json", "evaluation-test-int8.json", "decision.json"]:
        item = RUN / name
        if item.exists():
            archive.write(item, item.name)
files.download(str(result_zip))
''')
for i,c in enumerate(cells):c["id"]=f"voice-{i:02d}"
notebook={"nbformat":4,"nbformat_minor":5,"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"},"language_info":{"name":"python","version":"3.12"},"colab":{"name":"OurRecipes-Hebrew-Training.ipynb"},"accelerator":"GPU"},"cells":cells}
(ROOT/"OurRecipes-Hebrew-Training.ipynb").write_text(json.dumps(notebook,ensure_ascii=False,indent=2)+"\n")
print("Wrote Colab notebook; no cells executed")

"""Original synthetic Hebrew fixtures, not harvested recipes or user records."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LABELS = ["done", "not_done", "not_mentioned", "report", "next", "missed", "clarify", "advice"]
MODEL_ID = "dicta-il/dictabert-tiny"
MODEL_REVISION = "2034285c0ae100faf8ccc4beb7314bc273f3cb05"

# Each line pairs a source action with a first-person report.
# Recipes are deliberately tiny original training fixtures, not cooking advice.
RECIPE_SPECS = [
 ("train", "טחינה לימונית", "טחינה|מים|לימון|מלח", [("למזוג טחינה לקערה","מזגתי טחינה לקערה"),("להוסיף מים","הוספתי מים"),("לערבב את הטחינה","ערבבתי את הטחינה"),("להוסיף מיץ לימון","הוספתי מיץ לימון")]),
 ("train", "סלט ירקות", "עגבנייה|מלפפון|שמן|מלח", [("לחתוך עגבנייה","חתכתי עגבנייה"),("לחתוך מלפפון","חתכתי מלפפון"),("להוסיף שמן","הוספתי שמן"),("לערבב את הסלט","ערבבתי את הסלט")]),
 ("train", "אורז לבן", "אורז|שמן|מים|מלח", [("לשטוף את האורז","שטפתי את האורז"),("לחמם שמן בסיר","חיממתי שמן בסיר"),("להוסיף מים לסיר","הוספתי מים לסיר"),("לבשל את האורז","בישלתי את האורז")]),
 ("train", "חביתת עשבים", "ביצים|פטרוזיליה|שמן", [("לשבור ביצים לקערה","שברתי ביצים לקערה"),("לקצוץ פטרוזיליה","קצצתי פטרוזיליה"),("לטרוף את הביצים","טרפתי את הביצים"),("לטגן את החביתה","טיגנתי את החביתה")]),
 ("train", "פסטה בעגבניות", "פסטה|מים|עגבניות|שמן", [("להרתיח מים","הרתחתי מים"),("לבשל את הפסטה","בישלתי את הפסטה"),("לסנן את הפסטה","סיננתי את הפסטה"),("להוסיף רוטב עגבניות","הוספתי רוטב עגבניות")]),
 ("train", "מרק עדשים", "עדשים|בצל|מים|שמן", [("לשטוף את העדשים","שטפתי את העדשים"),("לקצוץ בצל","קצצתי בצל"),("להוסיף מים ועדשים לסיר","הוספתי מים ועדשים לסיר"),("לבשל את המרק","בישלתי את המרק")]),
 ("train", "תפוחי אדמה מעוכים", "תפוחי אדמה|מים|שמן", [("לקלף תפוחי אדמה","קילפתי תפוחי אדמה"),("לבשל את תפוחי האדמה","בישלתי את תפוחי האדמה"),("לסנן את המים","סיננתי את המים"),("למעוך את תפוחי האדמה","מעכתי את תפוחי האדמה")]),
 ("train", "יוגורט ופירות", "יוגורט|בננה|תפוח|שיבולת שועל", [("למזוג יוגורט לקערה","מזגתי יוגורט לקערה"),("לקלף בננה","קילפתי בננה"),("לחתוך את הפירות","חתכתי את הפירות"),("להוסיף שיבולת שועל","הוספתי שיבולת שועל")]),
 ("train", "גזר בתנור", "גזר|שמן|מלח", [("לקלף גזר","קילפתי גזר"),("לחתוך את הגזר","חתכתי את הגזר"),("לשמן את הגזר","שימנתי את הגזר"),("לאפות את הגזר","אפיתי את הגזר")]),
 ("train", "סלט חומוס", "חומוס מבושל|בצל|פטרוזיליה|לימון", [("לסנן חומוס מבושל","סיננתי חומוס מבושל"),("לקצוץ בצל","קצצתי בצל"),("לקצוץ פטרוזיליה","קצצתי פטרוזיליה"),("לערבב את הסלט","ערבבתי את הסלט")]),
 ("train", "ממרח אבוקדו", "אבוקדו|לימון|מלח", [("לחצות אבוקדו","חציתי אבוקדו"),("להוציא את בשר האבוקדו","הוצאתי את בשר האבוקדו"),("למעוך את האבוקדו","מעכתי את האבוקדו"),("להוסיף מיץ לימון","הוספתי מיץ לימון")]),
 ("train", "בטטה מבושלת", "בטטה|מים|מלח", [("לקלף בטטה","קילפתי בטטה"),("לחתוך את הבטטה לקוביות","חתכתי את הבטטה לקוביות"),("להוסיף מים לסיר","הוספתי מים לסיר"),("לבשל את הבטטה","בישלתי את הבטטה")]),
 ("train", "קוסקוס בקערה", "קוסקוס|מים|שמן", [("לשים קוסקוס בקערה","שמתי קוסקוס בקערה"),("להוסיף שמן","הוספתי שמן"),("להוסיף מים חמים","הוספתי מים חמים"),("לאוורר את הקוסקוס במזלג","אווררתי את הקוסקוס במזלג")]),
 ("train", "קישואים במחבת", "קישואים|בצל|שמן", [("לחתוך קישואים","חתכתי קישואים"),("לפרוס בצל","פרסתי בצל"),("לחמם שמן במחבת","חיממתי שמן במחבת"),("לטגן את הקישואים","טיגנתי את הקישואים")]),
 ("train", "סלט כרוב", "כרוב|גזר|לימון|שמן", [("לפרוס כרוב","פרסתי כרוב"),("לגרר גזר","גיררתי גזר"),("להוסיף מיץ לימון","הוספתי מיץ לימון"),("לערבב את הכרוב והגזר","ערבבתי את הכרוב והגזר")]),
 ("train", "תירס חם", "תירס|מים|מלח", [("להסיר עלים מהתירס","הסרתי עלים מהתירס"),("להרתיח מים בסיר","הרתחתי מים בסיר"),("להכניס תירס למים","הכנסתי תירס למים"),("להוציא את התירס מהסיר","הוצאתי את התירס מהסיר")]),
 ("train", "סלט סלק", "סלק מבושל|לימון|שמן|מלח", [("לקלף סלק מבושל","קילפתי סלק מבושל"),("לחתוך את הסלק","חתכתי את הסלק"),("להוסיף שמן","הוספתי שמן"),("לערבב את הסלק","ערבבתי את הסלק")]),
 ("train", "גבינה עם זיתים", "גבינה|זיתים|עירית", [("לשים גבינה בקערה","שמתי גבינה בקערה"),("לחתוך זיתים","חתכתי זיתים"),("לקצוץ עירית","קצצתי עירית"),("לערבב את הממרח","ערבבתי את הממרח")]),
 ("train", "אגסים בקערה", "אגסים|יוגורט|קינמון", [("לשטוף אגסים","שטפתי אגסים"),("לחתוך את האגסים","חתכתי את האגסים"),("להוסיף יוגורט","הוספתי יוגורט"),("לפזר קינמון","פיזרתי קינמון")]),
 ("train", "שיבולת שועל חמה", "שיבולת שועל|מים|תמרים", [("לשים שיבולת שועל בסיר","שמתי שיבולת שועל בסיר"),("להוסיף מים","הוספתי מים"),("לבשל את הדייסה","בישלתי את הדייסה"),("להוסיף תמרים קצוצים","הוספתי תמרים קצוצים")]),
 ("validation", "קינואה צבעונית", "קינואה|פלפל|מים|שמן", [("לשטוף קינואה","שטפתי קינואה"),("לבשל את הקינואה","בישלתי את הקינואה"),("לחתוך פלפל","חתכתי פלפל"),("לערבב קינואה ופלפל","ערבבתי קינואה ופלפל")]),
 ("validation", "מרק דלעת", "דלעת|בצל|מים|שמן", [("לקלף דלעת","קילפתי דלעת"),("לחתוך בצל","חתכתי בצל"),("לבשל את הדלעת והבצל","בישלתי את הדלעת והבצל"),("לטחון את המרק","טחנתי את המרק")]),
 ("validation", "סלט צנוניות", "צנוניות|מלפפון|לימון", [("לשטוף צנוניות","שטפתי צנוניות"),("לפרוס צנוניות","פרסתי צנוניות"),("לחתוך מלפפון","חתכתי מלפפון"),("לתבל במיץ לימון","תיבלתי במיץ לימון")]),
 ("validation", "אפונה בנענע", "אפונה|מים|נענע|שמן", [("לחמם מים בסיר","חיממתי מים בסיר"),("לבשל אפונה","בישלתי אפונה"),("לקצוץ נענע","קצצתי נענע"),("להוסיף נענע לאפונה","הוספתי נענע לאפונה")]),
 ("validation", "פטריות מוקפצות", "פטריות|בצל|שמן", [("לנקות פטריות","ניקיתי פטריות"),("לפרוס את הפטריות","פרסתי את הפטריות"),("לחמם שמן במחבת","חיממתי שמן במחבת"),("להקפיץ את הפטריות","הקפצתי את הפטריות")]),
 ("test", "בורגול בעשבים", "בורגול|מים|שמיר|לימון", [("לשים בורגול בקערה","שמתי בורגול בקערה"),("להוסיף מים לבורגול","הוספתי מים לבורגול"),("לקצוץ שמיר","קצצתי שמיר"),("לערבב בורגול ושמיר","ערבבתי בורגול ושמיר")]),
 ("test", "כרובית בתנור", "כרובית|מים|שמן|מלח", [("לפרק כרובית לפרחים","פירקתי כרובית לפרחים"),("לשטוף את הכרובית","שטפתי את הכרובית"),("לשמן את הכרובית","שימנתי את הכרובית"),("לאפות את הכרובית","אפיתי את הכרובית")]),
 ("test", "ממרח שעועית", "שעועית מבושלת|לימון|שמן", [("לסנן שעועית מבושלת","סיננתי שעועית מבושלת"),("למעוך את השעועית","מעכתי את השעועית"),("להוסיף מיץ לימון","הוספתי מיץ לימון"),("לערבב את הממרח","ערבבתי את הממרח")]),
 ("test", "אטריות שומשום", "אטריות|מים|שמן|שומשום", [("להרתיח מים","הרתחתי מים"),("לבשל אטריות","בישלתי אטריות"),("לסנן את האטריות","סיננתי את האטריות"),("לפזר שומשום","פיזרתי שומשום")]),
 ("test", "סלט תפוזים", "תפוזים|חסה|שמן|לימון", [("לקלף תפוזים","קילפתי תפוזים"),("לקרוע עלי חסה","קרעתי עלי חסה"),("לחתוך פלחי תפוז","חתכתי פלחי תפוז"),("לערבב חסה ותפוזים","ערבבתי חסה ותפוזים")]),
]

def digest(value):
    raw = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()


def recipes():
    result = []
    for i, (split, title, ingredients, acts) in enumerate(RECIPE_SPECS):
        actions = [{"id": aid, "step": step, "text": text, "report": past}
                   for (aid, step), (text, past) in zip([("s0a0",0),("s1a0",1),("s1a1",1),("s2a0",2)], acts)]
        result.append({"id": f"r{i:02d}", "split": split, "title": title,
                       "ingredients": ingredients.split("|"), "actions": actions})
    return result


def examples(recipe):
    split = recipe["split"]
    a,b,c,d = recipe["actions"]
    pa,pb,pc,pd = [x["report"] for x in [a,b,c,d]]
    na,nb,nc = ["עוד לא " + p for p in [pa,pb,pc]]
    prefix = {"train":"", "validation":"לעדכון: ", "test":"רק לדווח: "}[split]
    def row(scenario, text, intent="report", effects=(), completed=(), current=0, previous=None):
        changes = [{"actionId": action["id"], "done": status, "evidence": quote} for action,status,quote in effects]
        return {"id": f'{recipe["id"]}-{scenario}', "recipe_id": recipe["id"], "split": split,
                "family": f"shared:{scenario}", "scenario": scenario,
                "utterance": text, "previous": previous,
                "state": {"currentStep":current,"completed":list(completed),
                          "remaining":[x["id"] for x in recipe["actions"] if x["id"] not in completed]},
                "gold": {"intent":intent,"changes":changes},
                "provenance":"synthetic_authored", "human_review":"pending"}
    def wrap(body): return prefix + body
    rows = [
      row("positive",wrap(pa),effects=[(a,True,pa)]),
      row("later_action",wrap(pc),effects=[(c,True,pc)],current=1),
      row("two_positive",wrap(pa+" וגם "+pb),effects=[(a,True,pa),(b,True,pb)]),
      row("partial_step",wrap(pb+" אבל "+nc),effects=[(b,True,pb),(c,False,nc)],completed=[a["id"]],current=1),
      row("negative",wrap(na),effects=[(a,False,na)]),
      row("correction_undo", {"train":"תיקון, ","validation":"בעצם טעיתי קודם, ","test":"אני מתקן את הדיווח הקודם: "}[split]+na,
          effects=[(a,False,na)],completed=[a["id"]],previous={"recipe_id":recipe["id"],"utterance":pa}),
      row("correction_done", {"train":"עדכון, ","validation":"בסוף כן עשיתי את זה: ","test":"בהמשך למה שאמרתי לפני כן, "}[split]+pa,
          effects=[(a,True,pa)],previous={"recipe_id":recipe["id"],"utterance":na}),
      row("already_done",wrap(pa+", זה כבר בוצע"),effects=[(a,True,pa)],completed=[a["id"]]),
      row("negative_then_done",wrap(na+", ועכשיו "+pb),effects=[(a,False,na),(b,True,pb)],completed=[a["id"]]),
      row("both_pending",wrap(nb+" וגם "+nc),effects=[(b,False,nb),(c,False,nc)],completed=[a["id"]],current=1),
    ]
    phrases = {
      "train": ["עשיתי את זה", "הוספתי משהו לקערה", "מה עושים עכשיו?", "אילו פעולות מוקדמות לא סימנתי?", "אפשר להחליף מרכיב בקקאו?", "חשבתי שכבר סיימתי, אבל אני לא בטוח", "אני מתכנן להתחיל עוד מעט", "עשיתי רק חלק מהפעולה", "עכשיו עברתי למתכון הזה, מה הלאה?", "נכון לעכשיו אין לי דיווח ברור"],
      "validation": ["סיימתי עם זה", "שמתי בפנים משהו", "מה הפעולה הבאה שנותרה?", "איזו פעולה חסרה לפני השלב הנוכחי?", "האם כדאי להוסיף ג'ינג'ר שלא מופיע כאן?", "אולי ביצעתי את הפעולה, אני לא זוכר", "אתחיל בהמשך, כשאהיה מוכן", "ביצעתי בערך חצי, לא ברור כמה נשאר", "אני כבר במתכון החדש, ממה מתחילים?", "אני צריך לבדוק מה באמת בוצע"],
      "test": ["גמרתי את הדבר הזה", "הוספתי את הדבר ההוא", "מה צריך לעשות בשלב הבא?", "על מה פסחתי לפני שהתקדמתי?", "מה דעתך על תוספת חרדל מעבר למתכון?", "נדמה לי שעשיתי משהו, אבל לא יודע מה", "אעשה את ההכנה אחר כך", "התחלתי, אבל לא השלמתי ואני לא יודע לתאר מה", "עזבתי את המתכון הקודם; מה עכשיו במתכון הנוכחי?", "אין לי עדיין תשובה מה עשיתי"],
    }[split]
    specs = [("ambiguous_pronoun","clarify"),("ambiguous_object","clarify"),("next","next"),("missed","missed"),("extra_advice","advice"),("uncertain","clarify"),("future_only","clarify"),("partial_action","clarify"),("recipe_switch","next"),("unknown_progress","clarify")]
    for (scenario,intent),phrase in zip(specs, phrases):
        rows.append(row(scenario,phrase,intent=intent,current=2 if scenario=="missed" else 0,
                        completed=[a["id"]] if scenario=="missed" else [],
                        previous={"recipe_id":"old-recipe","utterance":pa} if scenario=="recipe_switch" else None))
    for r in rows[10:]: r["family"] = f'{split}:{r["scenario"]}'
    question={"train":"מה הלאה?","validation":"איך ממשיכים מכאן?","test":"מה צריך לבוא אחרי זה?"}[split]
    first,rest=pa.split(" ",1);typo=first+first[-1]+" "+rest
    rows.extend([
        row("report_then_question",wrap(pa+", "+question),effects=[(a,True,pa)]),
        row("last_clause_correction",wrap(pa+". בעצם, "+na),effects=[(a,False,na)]),
        row("synthetic_typo",wrap(typo),effects=[(a,True,typo)]),
        row("unknown_action",{"train":"ניפיתי אבקת סוכר", "validation":"הקצפתי שמנת בצד", "test":"רידדתי בצק על השיש"}[split],intent="clarify"),
    ])
    rows[-1]["family"]=f"{split}:unknown_action"
    return rows


def load_data(root=ROOT / "data"):
    recs = json.loads((root / "recipes.json").read_text())
    rows = [json.loads(line) for name in ("train","validation","test")
            for line in (root / f"{name}.jsonl").read_text().splitlines() if line]
    validate(recs, rows)
    return {r["id"]:r for r in recs}, rows


def validate(recs, rows):
    by_id={r["id"]:r for r in recs}
    if len(by_id)!=len(recs): raise ValueError("Duplicate recipe")
    ids=set(); phrases={}; families={}; recipe_sets={}
    for row in rows:
        if row["id"] in ids: raise ValueError("Duplicate example")
        ids.add(row["id"])
        recipe=by_id[row["recipe_id"]]
        split=row["split"]
        if split!=recipe["split"]: raise ValueError("Recipe split leakage")
        recipe_sets.setdefault(split,set()).add(recipe["id"])
        norm=re.sub(r"[\W_]+","",row["utterance"]).lower()
        if norm in phrases and phrases[norm]!=split: raise ValueError("Utterance split leakage")
        phrases[norm]=split
        if not row["family"].startswith("shared:") and row["family"] in families and families[row["family"]]!=split: raise ValueError("Paraphrase split leakage")
        families[row["family"]]=split
        allowed={a["id"] for a in recipe["actions"]}
        state=row["state"]
        if set(state["completed"]) & set(state["remaining"]) or set(state["completed"])|set(state["remaining"]) != allowed: raise ValueError("Invalid state partition")
        if len(state["completed"])!=len(set(state["completed"])): raise ValueError("Duplicate completion")
        if not 0<=state["currentStep"]<=max(a["step"] for a in recipe["actions"]): raise ValueError("Invalid current step")
        gold=row["gold"]
        if gold["intent"] not in LABELS[3:]: raise ValueError("Unknown intent")
        if gold["intent"]!="report" and gold["changes"]: raise ValueError("Question mutates state")
        if gold["intent"]=="report" and not gold["changes"]: raise ValueError("Empty report")
        changed=set()
        for c in gold["changes"]:
            if c["actionId"] not in allowed or c["actionId"] in changed: raise ValueError("Invalid action")
            if not isinstance(c["done"],bool) or not c["evidence"] or c["evidence"] not in row["utterance"]: raise ValueError("Unsupported evidence")
            changed.add(c["actionId"])
    return {s:{"recipes":len(recipe_sets[s]),"examples":sum(r["split"]==s for r in rows)} for s in recipe_sets}


def queries(recipe, row):
    """Single shared contract for training, native evaluation, and browser fixtures."""
    state=row["state"]
    action_text={a["id"]:a["text"] for a in recipe["actions"]}
    completed="; ".join(action_text[a] for a in state["completed"]) or "אין"
    previous=row["previous"]
    previous_text=("אותו מתכון: " if previous["recipe_id"]==recipe["id"] else "מתכון אחר: ")+previous["utterance"] if previous else "אין"
    context=f'שלב נוכחי: {state["currentStep"]+1}\nהושלמו: {completed}\nדיווח קודם: {previous_text}\nמתכון: {recipe["title"]}\nרכיבים: {", ".join(recipe["ingredients"])}\nהוראות: '+"; ".join(a["text"] for a in recipe["actions"])
    base={"example_id":row["id"],"utterance":row["utterance"],"scenario":row["scenario"]}
    yield {**base,"task":"intent","action_id":None,"context":"משימה: סיווג כוונת הדיווח\n"+context,"label":row["gold"]["intent"]}
    changes={c["actionId"]:c["done"] for c in row["gold"]["changes"]}
    for action in recipe["actions"]:
        status="done" if changes.get(action["id"]) is True else "not_done" if changes.get(action["id"]) is False else "not_mentioned"
        yield {**base,"task":"action","action_id":action["id"],"context":f'משימה: סיווג פעולה\nפעולה נבדקת: {action["text"]}\n'+context,"label":status}

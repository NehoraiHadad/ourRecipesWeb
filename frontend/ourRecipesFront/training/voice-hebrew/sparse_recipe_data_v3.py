"""Deterministic, authored synthetic TRAIN/validation; never reads older datasets."""
import hashlib
import json
from pathlib import Path
import random

from sparse_recipe_v3 import validate

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'verification/sparse-recipe-data-v3-20261116.json'


def action(source, past, infinitive):
    return {'source': source, 'past': past, 'inf': infinitive}


RECIPES = [
    ('train', 'מרק עדשים', [
        action('לשטוף את העדשים.', 'שטפתי את העדשים', 'לשטוף את העדשים'),
        action('להוסיף ליטר מים לסיר.', 'הוספתי מים לסיר', 'להוסיף מים לסיר'),
        action('לערבב את המרק.', 'ערבבתי את המרק', 'לערבב את המרק'),
        action('לבשל את המרק עשרים דקות.', 'בישלתי את המרק', 'לבשל את המרק')]),
    ('train', 'חביתה', [
        action('לשבור שתי ביצים לקערה.', 'שברתי את הביצים', 'לשבור את הביצים'),
        action('להוסיף שתי כפות חלב.', 'הוספתי את החלב', 'להוסיף את החלב'),
        action('לטרוף את הביצים.', 'טרפתי את הביצים', 'לטרוף את הביצים'),
        action('לטגן במחבת.', 'טיגנתי את החביתה', 'לטגן את החביתה')]),
    ('train', 'טחינה', [
        action('למזוג ארבע כפות טחינה לקערה.', 'מזגתי את הטחינה', 'למזוג את הטחינה'),
        action('להוסיף מיץ לימון; כמות לא צוינה.', 'הוספתי מיץ לימון', 'להוסיף מיץ לימון'),
        action('להוסיף שלוש כפות מים.', 'הוספתי מים לקערה', 'להוסיף מים לקערה'),
        action('לערבב עד שמתקבל ממרח.', 'ערבבתי את הטחינה', 'לערבב את הטחינה')]),
    ('train', 'תפוחי אדמה בתנור', [
        action('לשטוף שלושה תפוחי אדמה.', 'שטפתי את תפוחי האדמה', 'לשטוף את תפוחי האדמה'),
        action('לקלף את תפוחי האדמה.', 'קילפתי את תפוחי האדמה', 'לקלף את תפוחי האדמה'),
        action('לחתוך לקוביות.', 'חתכתי את תפוחי האדמה לקוביות', 'לחתוך את תפוחי האדמה לקוביות'),
        action('לאפות בתנור לפי ההוראה.', 'אפיתי את תפוחי האדמה', 'לאפות את תפוחי האדמה')]),
    ('train', 'שייק בננה', [
        action('לקלף בננה אחת.', 'קילפתי את הבננה', 'לקלף את הבננה'),
        action('למזוג כוס חלב לבלנדר.', 'מזגתי חלב לבלנדר', 'למזוג חלב לבלנדר'),
        action('לטחון את השייק.', 'טחנתי את השייק', 'לטחון את השייק'),
        action('למזוג לכוס הגשה.', 'מזגתי את השייק לכוס', 'למזוג את השייק לכוס')]),
    ('train', 'אורז', [
        action('לשטוף כוס אורז.', 'שטפתי את האורז', 'לשטוף את האורז'),
        action('לחמם כף שמן בסיר.', 'חיממתי את השמן', 'לחמם את השמן'),
        action('להוסיף שתי כוסות מים לסיר.', 'הוספתי את המים לסיר', 'להוסיף את המים לסיר'),
        action('לבשל את האורז חמש עשרה דקות.', 'בישלתי את האורז', 'לבשל את האורז')]),
    ('validation', 'רוטב עגבניות', [
        action('לקצוץ בצל אחד.', 'קצצתי את הבצל', 'לקצוץ את הבצל'),
        action('להוסיף שלוש עגבניות מרוסקות.', 'הוספתי את העגבניות', 'להוסיף את העגבניות'),
        action('לערבב את הרוטב.', 'ערבבתי את הרוטב', 'לערבב את הרוטב'),
        action('לבשל את הרוטב עשר דקות.', 'בישלתי את הרוטב', 'לבשל את הרוטב')]),
    ('validation', 'דייסת סולת', [
        action('לחמם שתי כוסות חלב.', 'חיממתי את החלב', 'לחמם את החלב'),
        action('להוסיף שלוש כפות סולת.', 'הוספתי את הסולת', 'להוסיף את הסולת'),
        action('לבשל את הדייסה.', 'בישלתי את הדייסה', 'לבשל את הדייסה'),
        action('לערבב את הדייסה.', 'ערבבתי את הדייסה', 'לערבב את הדייסה')]),
]


def build():
    result = {'train': [], 'validation': []}
    families = ['clear', 'negation', 'partial', 'correction', 'uncertainty', 'side-doubt', 'multiple', 'reference', 'question', 'nonreport-and-next']
    for ri, (split, name, actions) in enumerate(RECIPES):
        rng = random.Random(9020 + ri)
        ids = rng.sample([f'a{i}' for i in range(10)], len(actions))
        recipe = {'id': f'sparse-recipe-{ri}', 'version': 'source-1', 'name': name,
                  'actions': [{'id': i, 'source': a['source'], 'step': k} for k, (i, a) in enumerate(zip(ids, actions))]}
        train = split == 'train'
        for family in families:
            for k in range(6):
                ai = k % len(actions); bi = (ai + 1) % len(actions)
                a, b = actions[ai], actions[bi]; aid, bid = ids[ai], ids[bi]
                done = a['past'] if train else f"כבר {a['past']}"
                pending = f"עוד לא {a['past']}" if train else f"טרם {a['past']}"
                partial = f"התחלתי {a['inf']}, אבל עוד לא סיימתי" if train else f"הספקתי רק להתחיל {a['inf']}, נשאר להשלים"
                fs = []; targets = []; history = []; intent = 'report'
                progress = {i: rng.choice(['pending', 'partial', 'done']) for i in ids}
                if family == 'clear':
                    text = ['עדכון: ', 'רק שתדע, ', ''][k % 3] + done if train else ['מבחינתי זה הושלם: ', 'מדווח שסיימתי: ', ''][k % 3] + done
                    fs = [(aid, 'done')]
                elif family == 'negation':
                    text = ['בינתיים ', 'נכון לעכשיו ', ''][k % 3] + pending if train else ['למען הסר ספק, ', 'אצלי ', ''][k % 3] + pending
                    fs = [(aid, 'pending')]
                elif family == 'partial':
                    text = partial; fs = [(aid, 'partial')]
                elif family == 'correction':
                    status = ['pending', 'done', 'partial'][k % 3]
                    progress[aid] = {'pending': 'done', 'done': 'pending', 'partial': 'done'}[status]
                    history = [{'role': 'assistant', 'content': f"סימנתי את הפעולה {a['inf']} במצב {progress[aid]}."}]
                    text = ('תיקון לדיווח שלי: ' if train else 'אני חוזר בי ממה שאמרתי, ') + {'done': done, 'pending': pending, 'partial': partial}[status]
                    fs = [(aid, status)]
                elif family == 'uncertainty':
                    text = (['אולי ', 'אני לא בטוח אם ', 'יכול להיות ש'][k % 3] if train else ['נדמה לי ש', 'קשה לי לזכור אם ', 'ייתכן ש'][k % 3]) + a['past']
                    targets = [aid]; intent = 'clarify'
                elif family == 'side-doubt':
                    text = (['אולי המגבת בכביסה; ', 'לא בטוח איפה הכף, אבל ', 'אני חושב שהחלון פתוח; '][k % 3] if train else ['אינני זוכר איפה המסננת. בכל אופן ', 'ייתכן שמישהו בדלת; ', 'נדמה לי שהשקית נקרעה, ובכל זאת '][k % 3]) + done
                    fs = [(aid, 'done')]
                elif family == 'multiple':
                    status = ['done', 'partial', 'done'][k % 3]
                    first = done if status == 'done' else partial
                    if k % 3 == 2:
                        text = first + ('; אולי ' if train else '; ייתכן ש') + b['past']
                        fs = [(aid, status)]; targets = [bid]
                    else:
                        text = first + (', אבל עוד לא ' if train else '; לעומת זאת טרם ') + b['past']
                        fs = [(aid, status), (bid, 'pending')]
                elif family == 'reference':
                    if k < 3:
                        history = [{'role': 'assistant', 'content': f"עכשיו הפעולה היא {a['inf']}."}]
                        text = (['את זה עשיתי', 'את זה עדיין לא עשיתי', 'עשיתי את זה רק חלקית'] if train else ['זה כבר בוצע אצלי', 'לגבי זה, טרם התחלתי', 'זה בוצע רק בחלקו'])[k]
                        fs = [(aid, ['done', 'pending', 'partial'][k])]
                    else:
                        history = [] if k == 3 else [{'role': 'assistant', 'content': f"הזכרנו שתי פעולות: {a['inf']} וגם {b['inf']}. לא ברור לאיזו אתה מתייחס."}]
                        text = ['כבר עשיתי את זה', 'השלמתי את הדבר הזה', 'זה כבר מאחוריי'][k - 3] if train else ['עם זה סיימתי', 'את הדבר ההוא עשיתי', 'הפעולה ההיא בוצעה'][k - 3]
                        targets = [None]; intent = 'clarify'
                elif family == 'question':
                    intent = ['next', 'missed', 'quantity', 'explain', 'quantity', 'other'][k]
                    text = ([f'מה עכשיו במתכון {name}?', f'מה דילגתי במתכון {name}?', f'מה הכמות בהוראה: {a["source"]}', f'מה פירוש ההוראה {a["source"]}', f'כמה מלח כתוב במתכון {name}?', f'האם אפשר לשמור את המתכון {name} למחר?'] if train else [f'במתכון {name}, מה עושים מכאן?', f'איזו פעולה חסרה לי ב{name}?', f'איזו כמות מצוינת כאן: {a["source"]}', f'תסביר את הפעולה הזאת: {a["source"]}', f'האם כתובה כמות סוכר ב{name}?', f'מישהו מכיר שיר על {name}?'])[k]
                else:
                    if k < 2:
                        text = done + (', מה השלב הבא?' if train else '; איך ממשיכים מכאן?')
                        fs = [(aid, 'done')]; intent = 'next'
                    elif k == 2:
                        text = ('אני מתכנן ' if train else 'מאוחר יותר אני מתכוון ') + a['inf']; intent = 'other'
                    elif k == 3:
                        text = (f'אם {a["past"]}, מה אמורים לעשות?' if train else f'נניח ש{a["past"]}, מה היה בא אחר כך?'); intent = 'explain'
                    elif k == 4:
                        text = (f'המשפט "{a["past"]}" הוא רק דוגמה, לא דיווח שלי.' if train else f'אני רק מצטט מישהו שאמר "{a["past"]}"; לא אמרתי שביצעתי זאת.'); intent = 'other'
                    else:
                        text = (f'תכתוב "{a["past"]}" בתשובה, זו בקשת ניסוח ולא דיווח ביצוע.' if train else f'זה טקסט לעריכה בלבד: "{a["past"]}". אל תראה בו עדכון בישול.'); intent = 'other'
                expected = {'intent': intent, 'facts': [{'action': i, 'status': s} for i, s in fs], 'clarify': targets}
                request = {'recipe': recipe, 'progress': progress, 'currentStep': rng.randrange(len(actions)), 'history': history, 'utterance': text}
                validate(expected, request)
                result[split].append({'id': f'{split}-r{ri}-{family}-{k}', 'family': family,
                                      'template_partition': split, 'input': request, 'expected': expected,
                                      'critical_no_facts': not fs})
    return {'version': 'sparse-recipe-v3', 'authored_synthetic': True, 'human_reviewed': False,
            'independent_test': False, 'older_data_read': False,
            'limits': 'Formula-correlated examples. Recipe identities, ingredient combinations and authored template variants partitioned; common Hebrew vocabulary and operations intentionally shared. Validation is exposed development, not a held test.',
            'splits': result}


if __name__ == '__main__':
    raw = (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode()
    with DATA.open('xb') as stream:
        stream.write(raw)
    print(json.dumps({'file': str(DATA), 'sha256': hashlib.sha256(raw).hexdigest(),
                      'splits': {s: len(v) for s, v in build()['splits'].items()}}))

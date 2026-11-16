"""Frozen-size data intervention and crossed development, never old held tests."""
import copy
import hashlib
import json
from pathlib import Path
import random

from sparse_recipe_data_v3 import RECIPES, action
from sparse_recipe_v3 import SYSTEM as ORIGINAL_SYSTEM, validate

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'verification/sparse-recipe-data-v4-20261116.json'
OLD = ROOT / 'verification/sparse-recipe-data-v3-20261116.json'
SYSTEM = ORIGINAL_SYSTEM + '\ncurrentStep הוא מיקום ניווט בלבד. הוא אינו עוגן לכינוי. עוגן לפעולה שנאמרה מגיע מההיסטוריה, ולא ממיקום הניווט.'
COUNTS = {'clear': 3, 'negation': 3, 'partial': 12, 'correction': 6,
          'uncertainty': 6, 'side-doubt': 4, 'multiple': 12,
          'reference': 6, 'question': 4, 'nonreport-and-next': 4}


def messages(row):
    return [{'role': 'system', 'content': SYSTEM},
            {'role': 'user', 'content': json.dumps(row['input'], ensure_ascii=False, separators=(',', ':'))}]


def clause(a, status, variant, novel=False):
    p, inf = a['past'], a['inf']
    if status == 'done':
        forms = [f'{p}, ואני מאשר שהשלמתי', f'סיימתי {inf}', f'סיימתי את החלק הזה: {p}'] if not novel else [f'מעדכן שהפעולה הושלמה: {p}', f'אפשר לסמן שבוצע: {p}', f'אין עוד מה להשלים בפעולה הזאת, {p}', f'זה בוצע עד הסוף: {p}']
    elif status == 'pending':
        forms = [f'{inf}? עוד לא עשיתי את זה', f'עדיין לא התחלתי {inf}', f'{p}? לא, זה עוד לא קרה'] if not novel else [f'{inf} עדיין מחכה לביצוע אצלי', f'לגבי הפעולה {inf}, לא נגעתי בה עדיין', f'{inf} זה משהו שעוד לא ביצעתי', f'אני לפני ההתחלה של הפעולה {inf}']
    elif status == 'partial':
        forms = [f'בינתיים עשיתי רק חלק מהפעולה: {inf}. ההמשך עוד נשאר',
                 f'אני באמצע, התחלתי {inf} ועדיין עובד על זה',
                 f'התחלתי {inf} והפסקתי באמצע',
                 f'{p} רק חלקית; לא סיימתי',
                 f'זה עדיין בתהליך: התחלתי {inf}',
                 f'כבר התקדמתי קצת עם הפעולה {inf}, והיא עוד לא הושלמה'] if not novel else [
                 f'נעצרתי לפני הסוף, אחרי שכבר התחלתי {inf}',
                 f'אני לא בהתחלה ולא בסוף: {p} רק באופן חלקי',
                 f'כבר התחלתי {inf}, ונשאר לי עוד לסיים את הפעולה',
                 f'לא השלמתי את הכול; {p} במידה חלקית']
    else:
        forms = [f'לא זוכר אם {p}', f'יש לי ספק אם {p}', f'אינני יכול לאשר ש{p}',
                 f'אני מתלבט אם באמת {p}', f'אולי רק דמיינתי ש{p}', f'אני לא מצליח להיזכר אם {p}'] if not novel else [
                 f'הזיכרון שלי מעורפל לגבי השאלה אם {p}', f'אין לי תשובה בטוחה אם {p}',
                 f'אני מסופק לגבי זה ש{p}', f'ייתכן שכן וייתכן שלא {p}']
    return forms[variant % len(forms)]


def make(recipe, action_meta, family, frame, ai, bi, seed, novel=False):
    rng = random.Random(seed)
    a, b = action_meta[ai], action_meta[bi]
    aid, bid = recipe['actions'][ai]['id'], recipe['actions'][bi]['id']
    progress = {x['id']: rng.choice(['pending', 'partial', 'done']) for x in recipe['actions']}
    history = []; fs = []; targets = []; intent = 'report'
    if family in ('clear', 'negation', 'partial', 'uncertainty'):
        status = {'clear': 'done', 'negation': 'pending', 'partial': 'partial', 'uncertainty': 'uncertain'}[family]
        text = clause(a, status, frame, novel)
        if status == 'uncertain':
            targets = [aid]; intent = 'clarify'
        else:
            fs = [(aid, status)]
    elif family == 'correction':
        status = ['pending', 'done', 'partial'][frame % 3]
        progress[aid] = {'pending': 'done', 'done': 'pending', 'partial': 'done'}[status]
        history = [{'role': 'assistant', 'content': f"לפי הדיווח הקודם סימנתי את {a['inf']} כ-{progress[aid]}."}]
        text = ('צריך לעדכן את מה שאמרתי קודם: ' if not novel else 'המידע הקודם שלי היה מוטעה, הנה התיקון: ') + clause(a, status, frame, novel)
        fs = [(aid, status)]
    elif family == 'side-doubt':
        prefix = ['לא בטוח שהרדיו עובד. עם זאת ', 'אולי המשלוח הגיע. בכל מקרה ',
                  'יש לי ספק איפה המכסה; בוודאות ', 'לא זוכר מי התקשר, אבל '][frame % 4] if not novel else [
                  'הנורה אולי שרופה; לגבי הבישול עצמו ', 'ייתכן שהכלב בחצר, ואילו כאן ',
                  'לא ברור לי אם הגיעה הודעה, אבל ', 'אני מסופק אם הדלת נעולה; בוודאות '][frame % 4]
        text = prefix + clause(a, 'done', frame, novel); fs = [(aid, 'done')]
    elif family == 'multiple':
        sa, sb = [('done', 'pending'), ('partial', 'done'), ('done', 'uncertain'),
                  ('uncertain', 'done'), ('done', 'done'), ('partial', 'pending')][frame % 6]
        text = clause(a, sa, frame, novel) + ('; בנפרד, ' if not novel else '. לגבי פעולה נוספת, ') + clause(b, sb, frame + 1, novel)
        for target, status in [(aid, sa), (bid, sb)]:
            if status == 'uncertain': targets.append(target)
            else: fs.append((target, status))
    elif family == 'reference':
        if frame % 6 in (0, 1, 2, 5):
            history = [{'role': 'assistant', 'content': f"עכשיו ההוראה היא {a['source']}"}]
            status = {0: 'done', 1: 'pending', 2: 'partial', 5: 'pending'}[frame % 6]
            texts = ['את הדבר האחרון שאמרת כבר ביצעתי', 'את הפעולה שהזכרת עוד לא התחלתי לבצע',
                     'עשיתי רק חלק מהדבר שביקשת כרגע', '', '', 'לא נכון שסיימתי את זה, עם זה עוד לא התחלתי'] if not novel else [
                     'מה שביקשת עכשיו כבר הושלם', 'לזה שאמרת עכשיו עדיין לא ניגשתי',
                     'ביצעתי מקצת ממה שהורית כרגע, נשאר להמשיך', '', '', 'צריך לתקן: הפעולה שהזכרת לא התחילה']
            text = texts[frame % 6]; fs = [(aid, status)]
            if frame % 6 == 5: progress[aid] = 'done'
        else:
            history = [{'role': 'assistant', 'content': f"יש שתי אפשרויות נפרדות: {a['inf']} או {b['inf']}. עוד לא בחרנו אחת."}]
            text = ('כבר עשיתי אחת מהן, לא אמרתי איזו' if frame % 6 == 3 else 'זה הושלם, אבל לא ציינתי למה אני מתכוון') if not novel else ('אחת משתי הפעולות מאחוריי, בלי לפרט איזו' if frame % 6 == 3 else 'את הדבר ההוא השלמתי, אינני מציין איזו משתי האפשרויות')
            targets = [None]; intent = 'clarify'
    elif family == 'question':
        intent = ['next', 'missed', 'quantity', 'explain'][frame % 4]
        source, name = a['source'], recipe['name']
        text = [f'לגבי {name} וההוראה "{source}", מה הצעד הבא?', f'איזו פעולה נשארה לפני ההוראה "{source}"?',
                f'מה כמות המרכיב שמצוינת כאן: "{source}"?', f'מה הכוונה במילים "{source}"?'][frame % 4] if not novel else [
                f'כיצד ממשיכים במתכון {name} מההוראה "{source}"?', f'מה פספסתי לפני "{source}"?',
                f'איזה מספר של כמות נכתב בהוראה "{source}"?', f'אפשר לפרש את ההנחיה "{source}"?'][frame % 4]
    else:
        intent = ['next', 'explain', 'other', 'other'][frame % 4]
        text = [clause(a, 'done', frame) + '; ואחרי העדכון הזה, מה עליי לעשות?', f'אם בעתיד אגיד "{a["past"]}", מה עושים אז?',
                f'רק ערוך את המשפט "{a["past"]}"; הוא לא מתאר מה עשיתי', f'בשלב מאוחר יותר אני מתכנן {a["inf"]}'][frame % 4] if not novel else [
                clause(a, 'done', frame, True) + '; אחרי מה שסיימתי, איזו פעולה לעשות כעת?', f'זה מצב דמיוני בלבד: נניח שאמרתי "{a["past"]}", מה אחר כך?',
                f'תקן ניסוח של "{a["past"]}" בלבד. אין כאן דיווח על הפעולה שלי', f'יש לי כוונה {a["inf"]} בהמשך, לא עכשיו'] [frame % 4]
        if frame % 4 == 0: fs = [(aid, 'done')]
    expected = {'intent': intent, 'facts': [{'action': i, 'status': s} for i, s in fs], 'clarify': targets}
    request = {'recipe': copy.deepcopy(recipe), 'progress': progress, 'currentStep': rng.randrange(4),
               'history': history, 'utterance': text}
    validate(expected, request)
    return {'family': family, 'frame': frame, 'input': request, 'expected': expected, 'critical_no_facts': not fs}


def build():
    old = json.loads(OLD.read_text())['splits']
    control = copy.deepcopy(old['train'])
    recipes = [copy.deepcopy(next(r['input']['recipe'] for r in control if r['input']['recipe']['id'] == f'sparse-recipe-{i}')) for i in range(6)]
    metadata = [row[2] for row in RECIPES[:6]]
    fresh = [
        ('סלט גזר וצימוקים', [action('לגרר שני גזרים.', 'גיררתי את הגזרים', 'לגרר את הגזרים'), action('להוסיף חופן צימוקים.', 'הוספתי צימוקים', 'להוסיף צימוקים'), action('לסחוט תפוז.', 'סחטתי את התפוז', 'לסחוט את התפוז'), action('לערבב את סלט הגזר.', 'ערבבתי את סלט הגזר', 'לערבב את סלט הגזר')]),
        ('פסטה עם פטריות', [action('לפרוס פטריות.', 'פרסתי את הפטריות', 'לפרוס את הפטריות'), action('לבשל את הפסטה.', 'בישלתי את הפסטה', 'לבשל את הפסטה'), action('להוסיף שמנת; כמות לא צוינה.', 'הוספתי שמנת', 'להוסיף שמנת'), action('לערבב את הפסטה.', 'ערבבתי את הפסטה', 'לערבב את הפסטה')]),
    ]
    for index, (name, meta) in enumerate(fresh):
        ids = random.Random(441 + index).sample([f'a{i}' for i in range(10)], 4)
        recipes.append({'id': f'new-v4-recipe-{index}', 'version': 'source-1', 'name': name,
                        'actions': [{'id': i, 'source': a['source'], 'step': k} for k, (i, a) in enumerate(zip(ids, meta))]})
        metadata.append(meta)
    candidate = []
    for ri in range(6):
        for family, count in COUNTS.items():
            number_frames = min(count, 6)
            for k in range(count):
                frame = k % number_frames; ai = (frame + k // number_frames + ri) % 4; bi = (ai + 1 + k % 2) % 4
                row = make(recipes[ri], metadata[ri], family, frame, ai, bi, 6000 + ri * 100 + len(candidate))
                row.update(id=f'v4-train-r{ri}-{family}-{k}', template_partition='training-frame')
                candidate.append(row)
    forbidden = {r['input']['utterance'] for r in control + candidate + old['validation']}
    requests = {json.dumps(r['input'], ensure_ascii=False, sort_keys=True) for r in control + candidate + old['validation']}
    development = []
    for recipe_kind, indices in [('seen-recipe', [0, 5]), ('unseen-recipe', [6, 7])]:
        for recipe_index, ri in enumerate(indices):
            for fi, family in enumerate(COUNTS):
                for variant in range(2):
                    frame = recipe_index * 2 + variant
                    if family in ('clear', 'negation'): frame %= 3
                    chosen = None
                    for ai in range(4):
                        for offset in range(1, 4):
                            bi = (ai + offset) % 4
                            seed = 91000 + ri * 100 + fi * 2 + variant
                            seen = make(recipes[ri], metadata[ri], family, frame, ai, bi, seed)
                            unseen = make(recipes[ri], metadata[ri], family, frame, ai, bi, seed, novel=True)
                            texts_disjoint = family == 'reference' or (seen['input']['utterance'] not in forbidden and unseen['input']['utterance'] not in forbidden)
                            inputs_disjoint = all(json.dumps(r['input'], ensure_ascii=False, sort_keys=True) not in requests for r in (seen, unseen))
                            if texts_disjoint and inputs_disjoint:
                                chosen = seen, unseen; break
                        if chosen: break
                    if not chosen:
                        raise ValueError(f'No disjoint combination: {ri}/{family}/{frame}')
                    pair = f'pair-r{ri}-{family}-{variant}'
                    for frame_kind, row in zip(['seen-frame', 'unseen-frame'], chosen):
                        row.update(id=f'v4-dev-{recipe_kind}-{frame_kind}-r{ri}-{family}-{variant}',
                                   cell=f'{recipe_kind}/{frame_kind}', pair_id=pair,
                                   template_partition=frame_kind)
                        development.append(row)
                        forbidden.add(row['input']['utterance'])
                        requests.add(json.dumps(row['input'], ensure_ascii=False, sort_keys=True))
    return {'version': 'sparse-recipe-v4', 'authored_synthetic': True, 'human_reviewed': False,
            'independent_test': False, 'old_held_sets_read': False,
            'limits': 'Two training datasets of360 each; crossed160 development cases in80 matched template pairs. Seen frame is relative to candidate TRAIN. Known-frame reference utterances can repeat with different history/state; exact full requests are disjoint. Recipes/frames correlated, not natural independent conversations. Old120 are exposed regression only.',
            'splits': {'control_train': control, 'diverse_train': candidate, 'development': development,
                       'regression': copy.deepcopy(old['validation'])}}


if __name__ == '__main__':
    raw = (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode()
    with DATA.open('xb') as stream: stream.write(raw)
    print(json.dumps({'sha256': hashlib.sha256(raw).hexdigest(), 'splits': {s: len(v) for s, v in build()['splits'].items()}}))

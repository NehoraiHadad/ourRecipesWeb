"""Fixed-size replay versus replay+counterfactual data, TRAIN sources only."""
import copy
import hashlib
import json
from pathlib import Path
import random

from sparse_recipe_data_v3 import RECIPES
from sparse_recipe_v3 import validate

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'verification/sparse-recipe-data-v5-20261116.json'


def choose(rows, count, family, ri, old=False):
    if old and family == 'reference':
        indices = [0, 3, 4][:count]
    elif old and family == 'correction':
        indices = [0, 2, 1][:count]
    elif old and family == 'uncertainty':
        indices = list(range(count))
    else:
        indices = [(i + ri) % len(rows) for i in range(count)]
    return [copy.deepcopy(rows[i]) for i in indices]


def selected(pool, old, size):
    result = []
    for ri in range(6):
        if old:
            counts = {f: size // 10 for f in ['clear', 'negation', 'partial', 'correction', 'uncertainty', 'side-doubt', 'multiple', 'reference', 'question', 'nonreport-and-next']}
        elif size == 30:
            counts = {'clear': 1 + ri % 2, 'negation': 2 - ri % 2, 'partial': 6, 'multiple': 6,
                      'correction': 3, 'uncertainty': 3, 'reference': 3, 'side-doubt': 2, 'question': 2, 'nonreport-and-next': 2}
        else:
            counts = {'clear': 1, 'negation': 1, 'partial': 4, 'multiple': 4, 'correction': 2,
                      'uncertainty': 2, 'reference': 2, 'side-doubt': 2, 'question': 1, 'nonreport-and-next': 1}
        for family, count in counts.items():
            rows = [r for r in pool if r['input']['recipe']['id'] == f'sparse-recipe-{ri}' and r['family'] == family]
            picked = choose(rows, count, family, ri, old)
            for row in picked:
                row['training_origin'] = 'old' if old else 'diverse'
            result.extend(picked)
    return result


def counterfactuals(old_pool):
    result = []
    for ri in range(6):
        recipe = next(r['input']['recipe'] for r in old_pool if r['input']['recipe']['id'] == f'sparse-recipe-{ri}')
        for ai, a in enumerate(RECIPES[ri][2]):
            aid = recipe['actions'][ai]['id']; rng = random.Random(77500 + ri * 4 + ai)
            progress = {x['id']: rng.choice(['pending', 'partial', 'done']) for x in recipe['actions']}
            current = rng.randrange(4); v = (ri + ai) % 4
            p, inf, source = a['past'], a['inf'], a['source']
            forms = {
                'done': [f'העדכון שלי חד משמעי: {p}', f'השלמתי את הפעולה הזאת בפועל: {p}', f'סוף סוף גמרתי {inf}', f'מאשר ביצוע עד הסוף: {p}'],
                'pending': [f'הפעולה {inf} עוד לא התחילה אצלי', f'לא יצא לי להתחיל {inf}', f'בפועל טרם התחלתי {inf}', f'{inf} עוד לא נעשה אצלי בכלל'],
                'partial': [f'כבר התחלתי {inf}, והפעולה עדיין נמשכת', f'אני באמצע הפעולה {inf}; רק חלק ממנה מאחוריי', f'{p} באופן חלקי וההמשך עוד לפניי', f'התקדמתי בחלק מהפעולה {inf}; היא עדיין לא גמורה'],
                'uncertain': [f'אינני יודע לקבוע האם {p}; אני צריך להיזכר', f'אני זוכר במעורפל, לא ודאי ש{p}', f'{p} או שלא? אינני זוכר', f'אין לי ביטחון מספיק לומר ש{p}'],
                'nonreport': [f'אני שואל מה המשמעות של "{source}"; לא מדווח על ביצוע', f'בשלב עתידי ארצה {inf}; זו תוכנית בלבד', f'הטקסט "{p}" מובא לעריכה בלבד ואינו דיווח שלי', f'שאלת פירוש בלבד: למה הכוונה ב"{source}"?'],
            }
            for status in forms:
                expected = {'intent': 'clarify' if status == 'uncertain' else ('explain' if v in (0, 3) else 'other') if status == 'nonreport' else 'report',
                            'facts': [] if status in ('uncertain', 'nonreport') else [{'action': aid, 'status': status}],
                            'clarify': [aid] if status == 'uncertain' else []}
                request = {'recipe': copy.deepcopy(recipe), 'progress': copy.deepcopy(progress), 'currentStep': current,
                           'history': [], 'utterance': forms[status][v]}
                validate(expected, request)
                result.append({'id': f'v5-counter-r{ri}-a{ai}-{status}', 'family': f'counter-{status}',
                               'counterfactual_group': f'v5-r{ri}-a{ai}', 'training_origin': 'counterfactual',
                               'input': request, 'expected': expected, 'critical_no_facts': not expected['facts']})
    return result


def fit_probe(rows):
    rng = random.Random(9015)
    chosen = []
    families = sorted({r['family'] for r in rows})
    per_family = 3 if len(families) <= 10 else 2
    for family in families:
        chosen += rng.sample([r for r in rows if r['family'] == family], per_family)
    ids = {r['id'] for r in chosen}
    chosen += rng.sample([r for r in rows if r['id'] not in ids], 36 - len(chosen))
    return copy.deepcopy(chosen)


def build():
    parent = json.loads((ROOT / 'verification/sparse-recipe-data-v4-20261116.json').read_text())['splits']
    replay = selected(parent['control_train'], True, 30) + selected(parent['diverse_train'], False, 30)
    paired = selected(parent['control_train'], True, 20) + selected(parent['diverse_train'], False, 20) + counterfactuals(parent['control_train'])
    return {'version': 'sparse-recipe-v5', 'authored_synthetic': True, 'human_reviewed': False,
            'scope': '360 TRAIN each: replay180old+180diverse; paired120old+120diverse+120counterfactual. Same total compute, not matched diverse-example exposure. V4 development/regression reused and exposed, no independent test claim. Legacy cell names relative to original V4 diverse corpus.',
            'splits': {'control_train': replay, 'diverse_train': paired,
                       'development': copy.deepcopy(parent['development']), 'regression': copy.deepcopy(parent['regression']),
                       'control_fit': fit_probe(replay), 'diverse_fit': fit_probe(paired)}}


if __name__ == '__main__':
    raw = (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode()
    with DATA.open('xb') as stream: stream.write(raw)
    print(json.dumps({'sha256': hashlib.sha256(raw).hexdigest(), 'splits': {s: len(v) for s, v in build()['splits'].items()}}))

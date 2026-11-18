"""Author and validate semantic supervision against the frozen Native V10 TRAIN."""
from collections import Counter, defaultdict
import json
from pathlib import Path
import unicodedata

from sparse_recipe_data_v3 import RECIPES
from sparse_recipe_v3 import INTENTS, STATUSES, validate

ROOT = Path(__file__).resolve().parent
NATIVE = 'verification/native-scope-data-v10-20261116.json'
LABELS = 'verification/semantic-supervision-labels-v12-20261118.jsonl'
TRAIN_RECIPES = {name: actions for split, name, actions in RECIPES if split == 'train'}


def read_native(path=ROOT / NATIVE):
    splits = json.loads(path.read_text())['splits']
    sizes = {'train': 360, 'validation': 40, 'diagnostic': 120, 'regression': 120, 'train_fit': 36}
    if {key: len(rows) for key, rows in splits.items()} != sizes:
        raise ValueError('Unexpected Native V10 splits')
    return splits


def editorial_annotations(row):
    """Specify evidence and its interpretation independently of expected JSON."""
    request = row['input']
    actions = TRAIN_RECIPES[request['recipe']['name']]
    ai, bi = (row['role_positions'][role] for role in ('a', 'b'))
    a, b = actions[ai], actions[bi]
    p, q, inf = a['past'], b['past'], a['inf']
    plans = {
        'native-resolved-doubt': [
            ('report', [('a', 'superseded', f'הייתי בספק אם {p}'),
                        ('a', 'asserted', f'בדקתי וזה מאומת: {p} עד הסוף', 'done')]),
            ('clarify', [('a', 'uncertain', f'{p}, לפחות זה מה שחשבתי. כעת אני לא זוכר אם זה באמת קרה')]),
        ],
        'native-partial-certainty': [
            ('report', [('a', 'asserted', f'הספקתי לבצע רק חלק מהפעולה "{inf}"', 'partial')]),
            ('clarify', [('a', 'uncertain', f'אולי הספקתי לבצע חלק מהפעולה "{inf}"')]),
        ],
        'native-negative-certainty': [
            ('report', [('a', 'asserted', f'לגבי הפעולה "{inf}" — לא התחלתי אותה בכלל', 'pending')]),
            ('clarify', [('a', 'uncertain', f'לגבי הפעולה "{inf}" — אני לא בטוחה אם היא נעשתה או שלא')]),
        ],
        'native-doubt-scope': [
            ('report', [(None, 'outside_recipe', 'אולי שכחתי לסגור את החלון'),
                        ('a', 'asserted', f'בבישול אין לי ספק: {p}', 'done')]),
            ('clarify', [(None, 'outside_recipe', 'החלון סגור בוודאות'),
                         ('a', 'uncertain', f'בבישול אני בספק אם {p}')]),
        ],
        'native-plan-versus-performance': [
            ('report', [('a', 'plan', 'בהתחלה זאת הייתה רק תוכנית'),
                        ('a', 'asserted', f'מאז {p}. הביצוע כבר הושלם', 'done')]),
            ('other', [('a', 'plan', f'זאת תוכנית בלבד: {inf} בהמשך')]),
        ],
        'native-correction-direction': [
            ('report', [('a', 'superseded', 'אמרתי שסיימתי'),
                        ('a', 'asserted', f'בפועל רק התחלתי {inf} והפסקתי באמצע', 'partial')]),
            ('report', [('a', 'superseded', 'אמרתי שלא סיימתי'),
                        ('a', 'asserted', f'עכשיו אני מאשר — {p} והכול הושלם', 'done')]),
        ],
        'native-actual-versus-fictional-next': [
            ('next', [('a', 'asserted', p, 'done')]),
            ('explain', [('a', 'hypothetical', f'בתסריט שהמצאתי, {p}')]),
        ],
        'native-report-versus-editing': [
            ('report', [('a', 'asserted', f'אני מדווח על מה שקרה במטבח, לא על דוגמה: {p}', 'done')]),
            ('other', [('a', 'quoted', f'אני מבקש לערוך דוגמה: "{p}"')]),
        ],
        'native-clause-local-uncertainty': [
            ('report', [('a', 'asserted', p, 'done'), ('b', 'asserted', f'עוד לא {q}', 'pending')]),
            ('report', [('a', 'uncertain', f'אינני יודע אם {p}'), ('b', 'asserted', f'עוד לא {q}', 'pending')]),
        ],
        'native-future-versus-partial-clause': [
            ('report', [('a', 'asserted', f'לגבי "{inf}", ביצעתי רק חלק ולא סיימתי', 'partial'),
                        ('b', 'asserted', f'{q} וכבר סיימתי את זה', 'done')]),
            ('report', [('a', 'plan', f'לגבי "{inf}", זאת רק תוכנית לעתיד ולא דיווח על ביצוע'),
                        ('b', 'asserted', f'{q} וכבר סיימתי את זה', 'done')]),
        ],
        'native-history-resolution': [
            ('report', [('a', 'asserted', 'בוצע. סיימתי עם זה.', 'done')]),
            ('clarify', [(None, 'asserted', 'בוצע. סיימתי עם זה.', 'done')]),
        ],
        'native-reported-versus-queried-missing': [
            ('missed', [('a', 'asserted', f'עוד לא {p}', 'pending'), ('b', 'asserted', q, 'done')]),
            ('missed', []),
        ],
    }
    intent, clauses = plans[row['family']][row['variant']]
    recipe = request['recipe']
    ids = {'a': recipe['actions'][ai]['id'], 'b': recipe['actions'][bi]['id'], None: None}
    output = []
    for role, stance, evidence, *status in clauses:
        if request['utterance'].count(evidence) != 1:
            raise ValueError(f'Nonunique or missing evidence in {row["id"]}: {evidence}')
        output.append({'action': ids[role], 'stance': stance, 'evidence': evidence,
                       **({'status': status[0]} if status else {})})

    history = None
    if row['family'] == 'native-history-resolution':
        candidates = ['a'] if row['variant'] == 0 else ['a', 'b']
        history = {'message': 0, 'candidates': [ids[role] for role in candidates]}
    return {'id': row['id'], 'recipe': [recipe['id'], recipe['version']],
            'target': {'intent': intent, 'clauses': output}, 'history': history}


def validate_label(row, label):
    request = row['input']
    recipe = request['recipe']
    actions = recipe['actions']
    ids = {a['id']: a['source'] for a in actions}
    if row['training_origin'] != 'native' or recipe['name'] not in TRAIN_RECIPES:
        raise ValueError('Expected a Native TRAIN recipe')
    sources = [a['source'] for a in TRAIN_RECIPES[recipe['name']]]
    if [a['source'] for a in actions] != sources or len(ids) != len(actions):
        raise ValueError('Recipe actions differ from their TRAIN source')
    if label['id'] != row['id'] or label['recipe'] != [recipe['id'], recipe['version']]:
        raise ValueError('Label belongs to a different row or recipe revision')
    target = label['target']
    if set(target) != {'intent', 'clauses'} or target['intent'] not in INTENTS:
        raise ValueError('Invalid auxiliary envelope')
    projected = {'intent': target['intent'], 'facts': [], 'clarify': []}
    spans = []
    for clause in target['clauses']:
        action, stance, evidence = (clause[key] for key in ('action', 'stance', 'evidence'))
        fields = {'action', 'stance', 'evidence'} | ({'status'} if stance == 'asserted' else set())
        if set(clause) != fields or not evidence or request['utterance'].count(evidence) != 1:
            raise ValueError('Invalid clause fields or utterance evidence')
        start = request['utterance'].index(evidence)
        if spans and start < spans[-1][1]:
            raise ValueError('Clauses overlap or are out of order')
        spans.append((start, start + len(evidence)))
        if action is not None and action not in ids:
            raise ValueError('Action does not belong to the current recipe')
        if stance == 'asserted':
            if clause['status'] not in STATUSES:
                raise ValueError('Invalid asserted status')
            if action is None:
                projected['clarify'].append(None)
            else:
                projected['facts'].append({'action': action, 'status': clause['status']})
        elif stance == 'uncertain':
            projected['clarify'].append(action)
        elif stance == 'outside_recipe':
            if action is not None:
                raise ValueError('Out-of-scope clause carries a recipe action')
        elif stance in {'plan', 'quoted', 'hypothetical', 'superseded'}:
            if action is None:
                raise ValueError('Nonreport clause requires its source action')
        else:
            raise ValueError('Unknown stance')

    anchor = label['history']
    if bool(request['history']) != (anchor is not None):
        raise ValueError('Missing or spurious history grounding')
    if anchor is not None:
        history = request['history']
        if anchor['message'] != 0 or len(history) != 1 or history[0]['role'] != 'assistant':
            raise ValueError('Unexpected TRAIN history provenance')
        content = history[0]['content']
        candidates = [action for action, source in ids.items() if source in content]
        if not candidates or set(anchor['candidates']) != set(candidates) or len(anchor['candidates']) != len(candidates):
            raise ValueError('History candidates disagree with current recipe evidence')
        resolved = candidates[0] if len(candidates) == 1 else None
        if [clause['action'] for clause in target['clauses']] != [resolved]:
            raise ValueError('History did not ground the assertion as intended')
    if validate(projected, request) != row['expected']:
        raise ValueError(f'Auxiliary clauses disagree with the frozen primary target: {row["id"]}')


def normalized(text):
    return ' '.join(unicodedata.normalize('NFKC', text).casefold().split())


def audit(splits, labels):
    rows = [r for r in splits['train'] if r['training_origin'] == 'native']
    if len(rows) != 144 or [r['id'] for r in rows] != [label['id'] for label in labels]:
        raise ValueError('Label coverage or TRAIN order differs from frozen Native V10')
    train_names = {r['input']['recipe']['name'] for r in rows}
    exposed = [row for key in ('validation', 'diagnostic', 'regression') for row in splits[key]]
    train_fixtures = {(r['input']['recipe']['id'], r['input']['recipe']['version']) for r in rows}
    evaluation_fixtures = {(r['input']['recipe']['id'], r['input']['recipe']['version']) for r in exposed}
    if train_fixtures & evaluation_fixtures:
        raise ValueError('Auxiliary recipe fixture overlaps an evaluation fixture')
    overlapping_names = {key: sorted(train_names & {r['input']['recipe']['name'] for r in splits[key]})
                         for key in ('validation', 'diagnostic', 'regression')}
    if {normalized(r['input']['utterance']) for r in rows} & {normalized(r['input']['utterance']) for r in exposed}:
        raise ValueError('Auxiliary utterance overlaps evaluation')
    pairs = defaultdict(list)
    stances = Counter()
    for row, label in zip(rows, labels, strict=True):
        validate_label(row, label)
        if label != editorial_annotations(row):
            raise ValueError(f'Frozen label differs from editorial annotations: {row["id"]}')
        pairs[row['pair']].append((row, label))
        stances.update(clause['stance'] for clause in label['target']['clauses'])
    for pair, variants in pairs.items():
        (left, a), (right, b) = sorted(variants, key=lambda member: member[0]['variant'])
        axis = left['pair_axis']
        if left['variant'] != 0 or right['variant'] != 1 or axis != right['pair_axis']:
            raise ValueError(f'Invalid contrast variants: {pair}')
        changed = [key for key in left['input'] if left['input'][key] != right['input'][key]]
        if changed != [axis] or a['target'] == b['target']:
            raise ValueError(f'Invalid paired supervision: {pair}')
    return {'labeled_rows': len(rows), 'recipe_names': len(train_names), 'pairs': len(pairs),
            'rows_by_family': dict(sorted(Counter(r['family'] for r in rows).items())),
            'clauses_by_stance': dict(sorted(stances.items())),
            'literal_normalized_overlap_with_development_and_regression': 0,
            'overlapping_recipe_names': overlapping_names, 'overlapping_recipe_id_version_pairs': 0,
            'provenance': 'Assistant-authored and assistant-reviewed synthetic TRAIN. No model teacher or independent human review.'}


def read_labels():
    return [json.loads(line) for line in (ROOT / LABELS).read_text().splitlines()]


if __name__ == '__main__':
    splits = read_native()
    labels = [editorial_annotations(r) for r in splits['train'] if r['training_origin'] == 'native']
    print(json.dumps(audit(splits, labels), ensure_ascii=False, indent=2))
    with (ROOT / LABELS).open('x') as output:
        for label in labels:
            output.write(json.dumps(label, ensure_ascii=False, separators=(',', ':')) + '\n')

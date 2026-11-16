"""Descriptive overlapping error categories; never changes labels or selects checkpoints."""
import json
from pathlib import Path
from sparse_recipe_v3 import parse, score, facts, clarification

ROOT = Path(__file__).resolve().parent


def analyze(rows, records):
    assert [r['id'] for r in rows] == [r['id'] for r in records]
    counts = {}; examples = []
    for row, record in zip(rows, records):
        ev = score(row, record['text'])
        if ev['exact']: continue
        categories = []
        if not ev['valid']: categories.append('rejected')
        else:
            actual = parse(record['text'], row['input']); expected = row['expected']
            af, ef = dict(facts(actual)), dict(facts(expected))
            expected_targets = set(ef) | {t for t in expected['clarify'] if t is not None}
            if set(af) - expected_targets: categories.append('fact_target_outside_expected_facts_and_clarifications')
            if any(af[k] != ef[k] for k in set(af) & set(ef)): categories.append('wrong_status_on_reported_action')
            if set(ef) - set(af): categories.append('omitted_reported_action')
            if set(af) - set(ef): categories.append('reported_action_without_assertion')
            if clarification(actual) != clarification(expected): categories.append('clarification_mismatch')
            if actual['intent'] != expected['intent']: categories.append('intent_mismatch')
            if ev['facts_exact'] and ev['clarify_exact'] and not ev['intent_correct']: categories.append('intent_only')
        for cat in categories: counts[cat] = counts.get(cat, 0) + 1
        examples.append({'id': row['id'], 'utterance': row['input']['utterance'], 'history': row['input']['history'],
            'expected': row['expected'], 'actual_text': record['text'], 'categories': categories})
    return {'cases': len(rows), 'errors': len(examples), 'overlapping_categories': counts, 'examples': examples}


def run():
    data = json.loads((ROOT / 'verification/sparse-recipe-data-v6-20261116.json').read_text())
    reports = {}
    for arm, method in [('control', 'replay'), ('diverse', 'paired')]:
        base = ROOT / 'runs/ourrecipes-sparse-v5-20261116/recovered/study' / arm
        reports['v5-' + method] = {}
        for group, suffix in [('hard', ''), ('regression', 'regression-')]:
            records = json.loads((base / f'validation-step-{suffix}160.json').read_text())['records']
            reports['v5-' + method][group] = analyze(data[group], records)
    for route in ['tiny-free', 'tiny-json', 'teacher-json']:
        path = ROOT / 'runs/ourrecipes-reference-v6-20261116/recovered/study' / (route + '.json')
        if not path.exists(): continue
        records = json.loads(path.read_text())['records']
        reports['v6-' + route] = {g: analyze(rows, records[:40] if g == 'hard' else records[40:]) for g,rows in data.items()}
    result = {'scope': 'Posthoc descriptive, overlapping categories; no label changes, checkpoint selection, confidence estimates or new inference.', 'reports': reports}
    (ROOT / 'verification/sparse-recipe-error-analysis-v6-20261116.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({r:{g:{k:v for k,v in stats.items() if k != 'examples'} for g,stats in groups.items()} for r,groups in reports.items()},indent=2))


if __name__ == '__main__': run()

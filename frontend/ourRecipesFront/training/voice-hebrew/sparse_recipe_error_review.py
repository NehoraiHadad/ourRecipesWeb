"""Reproduce descriptive error/curve counts without running or selecting a model."""
import argparse
import collections
import hashlib
import json
from pathlib import Path

from sparse_recipe_v3 import facts, parse
from sparse_recipe_report import incorrect_mutations

ROOT = Path(__file__).resolve().parent


def review(run):
    data = json.loads((ROOT / 'verification/sparse-recipe-data-v3-20261116.json').read_text())['splits']['validation']
    folder = ROOT / run / 'recovered/study'
    raw = (folder / 'validation-step-160.json').read_bytes()
    records = json.loads(raw)['records']
    assert [r['id'] for r in data] == [r['id'] for r in records]
    errors = []; per_recipe = {}; tp = fp = fn = matches = wrong_targets = 0
    for row, record in zip(data, records):
        actual = parse(record['text'], row['input'])
        expected_facts = set(facts(row['expected'])); actual_facts = set(facts(actual))
        tp += len(expected_facts & actual_facts)
        fp += len(actual_facts - expected_facts); fn += len(expected_facts - actual_facts)
        key = row['input']['recipe']['id']
        summary = per_recipe.setdefault(key, {'name': row['input']['recipe']['name'], 'cases': 0, 'exact': 0})
        summary['cases'] += 1; summary['exact'] += record['evaluation']['exact']
        for key in {i for i, s in actual_facts} - {i for i, s in expected_facts}:
            wrong_targets += 1
            matches += key == row['input']['recipe']['actions'][row['input']['currentStep']]['id']
        if not record['evaluation']['exact']:
            errors.append({'id': row['id'], 'family': row['family'], 'utterance': row['input']['utterance'],
                           'history': row['input']['history'], 'progress': row['input']['progress'],
                           'currentStep': row['input']['currentStep'], 'expected': row['expected'], 'actual': actual,
                           'unexpected_facts': [list(x) for x in sorted(actual_facts - expected_facts)],
                           'missing_facts': [list(x) for x in sorted(expected_facts - actual_facts)],
                           'incorrect_actual_mutations': incorrect_mutations(row, record['text']),
                           'critical_no_facts': row['critical_no_facts']})
    curve = [json.loads(line) for line in (folder / 'training.jsonl').read_text().splitlines()]
    assert [r['step'] for r in curve] == list(range(1, 161))
    return {'step': 160, 'source_validation_sha256': hashlib.sha256(raw).hexdigest(),
            'exact_fact_pairs': {'true_positive': tp, 'false_positive': fp, 'false_negative': fn,
                                 'note': 'Pair counts, not independent conversations'},
            'per_recipe': per_recipe,
            'wrong_id_proposals_matching_navigation': {'matches': matches, 'wrong_target_count': wrong_targets,
                  'note': 'Correlation only; no claim navigation caused an error'},
            'curve': {'updates': len(curve), 'first_loss': curve[0]['loss'], 'last_loss': curve[-1]['loss'],
                      'effective_examples': sum(len(c['example_ids']) for c in curve),
                      'first80_mean_loss': sum(c['loss'] for c in curve[:80]) / 80,
                      'last80_mean_loss': sum(c['loss'] for c in curve[80:]) / 80},
            'errors': errors}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('run'); parser.add_argument('--verify-against', required=True)
    args = parser.parse_args(); expected = json.loads((ROOT / args.verify_against).read_text())
    actual = review(args.run)
    for key, value in actual.items():
        assert expected[key] == value, key
    print(json.dumps({'verified_error_count': len(actual['errors']), 'curve_updates': actual['curve']['updates']}))
